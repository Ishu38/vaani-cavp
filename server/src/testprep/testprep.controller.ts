import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { createReadStream, readFileSync, statSync, unlinkSync } from 'fs';
import type { Response } from 'express';
import { ConsentService } from '../consent/consent.service';
import { UsersService } from '../users/users.service';
import { ConsentType } from '../consent/consent.schema';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { AttemptsService } from '../attempts/attempts.service';
import { Plan } from '../users/user.schema';

// Free-tier monthly mock quota — kept in code (not env) so it can't drift
// silently away from the public pricing copy. Pricing card promises
// "3 IELTS or TOEFL mocks per month" — combined across both test types.
const FREE_TIER_MONTHLY_QUOTA = 3;

/** Start of the current calendar month in UTC. We reset on the 1st rather
 *  than rolling 30-day windows because a calendar boundary is what the
 *  pricing copy implies, and it's easier for users to reason about.
 */
function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}
function startOfNextMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');

const audioStorage = diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `tp-${unique}${extname(file.originalname)}`);
  },
});

const audioFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = ['.wav', '.mp3', '.ogg', '.webm', '.flac', '.m4a'];
  const ext = extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`Unsupported audio format: ${ext}`), false);
};

@ApiTags('TestPrep')
@Controller('api/testprep')
export class TestPrepController {
  private readonly logger = new Logger(TestPrepController.name);
  private readonly engineUrl: string;
  private readonly engineApiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly consent: ConsentService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly users: UsersService,
    private readonly attempts: AttemptsService,
    @InjectQueue('testprep') private readonly testprepQueue: Queue,
  ) {
    this.engineUrl = this.config.get<string>('FASTAPI_URL', 'http://localhost:8000');
    this.engineApiKey = this.config.get<string>('ENGINE_API_KEY', '');
  }

  /** Auto-save a scored attempt for a signed-in user. Fire-and-forget — a
   *  Mongo blip must never make the user lose their score. Acoustic block
   *  is stripped of predicted_substitutions before persisting (CAVP user
   *  surface stays acoustic-measurement-only). */
  private persistAttempt(
    userId: string,
    testType: 'ielts' | 'toefl',
    body: any,
    result: any,
  ): void {
    const ielts = result?.ielts || result?.toefl || {};
    const profile = result?.profile || {};
    const cif = profile?.cif_analysis || {};
    // Drop any predicted_substitutions table the engine may attach.
    const { predicted_substitutions: _ps, ...cifSafe } = cif as any;
    const acoustic = {
      cif: cifSafe,
      prosodic_profile: profile?.prosodic_profile,
      voice_quality: profile?.voice_quality,
      phoneme_analysis: profile?.phoneme_analysis,
      audio_quality: result?.audio_quality,
      warnings: result?.warnings || [],
    };
    const transcript = profile?.transcription?.text || '';
    this.attempts
      .create({
        userId,
        testType,
        bandOverall: ielts?.overall_band != null ? String(ielts.overall_band) : undefined,
        bands: ielts || {},
        acoustic,
        transcript,
        promptId: body?.prompt_id || undefined,
        l1Language: body?.l1_language || undefined,
        feedback: { notes: ielts?.notes || [] },
      })
      .catch((err) =>
        this.logger.warn(`attempt autosave failed for ${userId}: ${err?.message || err}`),
      );
  }

  /** Free-tier monthly meter. Throws 402 (Payment Required) with a structured
   *  error body when the user has hit the quota. Paying tiers (`test_cycle`,
   *  `pro`, `centre`) bypass the meter entirely. Expired time-bound plans
   *  silently fall back to `free` (see UsersService.getEffectivePlan).
   *
   *  We count Attempt documents (post-success) as the quota source, so a
   *  failed engine run never burns a free attempt. Trade-off: a user who
   *  spams parallel submissions while one is in-flight could squeeze 1
   *  extra free run; acceptable for week-1 launch.
   */
  private async enforceMonthlyQuota(userId: string, feature: 'analyze' | 'report'): Promise<void> {
    const { plan, expired, expiresAt } = await this.users.getEffectivePlan(userId);

    // PDF reports are a paid-tier-only feature — pricing card lists them on
    // Test Cycle / Pro / Centre, NOT on Free. Block outright instead of
    // metering; "0 of 0" would just confuse the user.
    if (feature === 'report' && plan === Plan.FREE) {
      throw new HttpException(
        {
          code: 'feature_blocked',
          plan,
          feature: 'pdf_report',
          message:
            'Downloadable PDF reports are part of the Test Cycle Pass and Pro plans. Upgrade to download a report for this attempt.',
          upgradeUrl: '/pricing',
          previouslyOnPlan: expired ? 'expired' : null,
          expiresAt,
        },
        402,
      );
    }

    if (plan !== Plan.FREE) return; // paid tiers: unlimited analyze + reports

    const since = startOfCurrentMonthUtc();
    const used = await this.attempts.countForUserSince(userId, since);
    if (used >= FREE_TIER_MONTHLY_QUOTA) {
      throw new HttpException(
        {
          code: 'quota_exceeded',
          plan,
          feature: feature === 'report' ? 'pdf_report' : 'mock_analyze',
          used,
          limit: FREE_TIER_MONTHLY_QUOTA,
          resetsAt: startOfNextMonthUtc().toISOString(),
          upgradeUrl: '/pricing',
          message:
            `You've used all ${FREE_TIER_MONTHLY_QUOTA} free mocks this month. ` +
            'Upgrade to the Test Cycle Pass (₹499 / 8 weeks unlimited) or Pro (₹199/month) to keep practising.',
          previouslyOnPlan: expired ? 'expired' : null,
          expiresAt,
        },
        402,
      );
    }
  }

  /** Throws ForbiddenException if the user has not yet consented to the IELTS flow. */
  private async ensureIeltsConsent(userId: string): Promise<void> {
    const ok = await this.consent.isIeltsAnalysisAllowed(userId);
    if (!ok) {
      throw new ForbiddenException(
        'Consent required: please accept the IELTS analysis consent before submitting audio. ' +
          'POST /api/testprep/consent to record your consent.',
      );
    }
  }

  private engineHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.engineApiKey) h['X-Engine-API-Key'] = this.engineApiKey;
    return h;
  }

  @Get('prompts/ielts')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'List IELTS Part 2 cue cards' })
  async ieltsPrompts(@Query('topic') topic?: string) {
    const qs = topic ? `?topic=${encodeURIComponent(topic)}` : '';
    const res = await fetch(`${this.engineUrl}/api/prompts/ielts${qs}`, {
      headers: this.engineHeaders(),
    });
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json();
  }

  @Get('prompts/toefl')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'List TOEFL Speaking prompts' })
  async toeflPrompts(@Query('task_number') task?: string) {
    const qs = task ? `?task_number=${encodeURIComponent(task)}` : '';
    const res = await fetch(`${this.engineUrl}/api/prompts/toefl${qs}`, {
      headers: this.engineHeaders(),
    });
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json();
  }

  @Post('ielts/analyze')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: audioStorage,
      fileFilter: audioFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async ieltsAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { gender?: string; l1_language?: string; prompt_id?: string },
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Audio file is required');
    await this.ensureIeltsConsent(req.user.userId);
    await this.enforceMonthlyQuota(req.user.userId, 'analyze');
    this.audit.log('analysis_run', req.user.userId, req.user.email, {
      targetType: 'ielts_analyze',
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      metadata: { l1_language: body?.l1_language || 'auto', prompt_id: body?.prompt_id || '' },
    });
    return this.enqueueAnalyze('ielts', file, body, req);
  }

  @Post('toefl/analyze')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: audioStorage,
      fileFilter: audioFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async toeflAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { gender?: string; l1_language?: string; task_number?: string; prompt_id?: string },
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Audio file is required');
    await this.ensureIeltsConsent(req.user.userId);
    await this.enforceMonthlyQuota(req.user.userId, 'analyze');
    this.audit.log('analysis_run', req.user.userId, req.user.email, {
      targetType: 'toefl_analyze',
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      metadata: { l1_language: body?.l1_language || 'auto', task_number: body?.task_number || '1' },
    });
    return this.enqueueAnalyze('toefl', file, body, req);
  }

  /** Enqueue an analyze job and return jobId for client polling. The
   *  TestPrepProcessor picks it up, calls the engine, and persists the
   *  attempt. We disk-persist the file (multer already wrote it) so the
   *  worker can pick it up after the HTTP request returns. The file is
   *  cleaned up by the worker in its finally{} block. */
  private async enqueueAnalyze(
    testType: 'ielts' | 'toefl',
    file: Express.Multer.File,
    body: any,
    req: any,
  ): Promise<{ jobId: string; status: 'queued' }> {
    const jobOpts: JobsOptions = {
      attempts: 1, // engine retries are expensive (30-90s each); fail fast
      removeOnComplete: { age: 3600, count: 100 }, // keep 1h / 100 jobs for client polling
      removeOnFail: { age: 86400, count: 200 },
    };
    const job = await this.testprepQueue.add(
      'analyze',
      {
        testType,
        filePath: file.path,
        fileMimeType: file.mimetype || 'audio/webm',
        fileOriginalName: file.originalname || `audio.webm`,
        userId: req.user.userId,
        userEmail: req.user.email || '',
        gender: body?.gender || 'neutral',
        l1_language: body?.l1_language || 'auto',
        prompt_id: body?.prompt_id || '',
        task_number: body?.task_number,
      },
      jobOpts,
    );
    return { jobId: String(job.id), status: 'queued' };
  }

  @Get('jobs/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 120, ttl: 60000 } }) // poll-friendly limit
  @ApiOperation({ summary: 'Get the state + result of an analyze job' })
  async getJob(@Param('id') id: string, @Req() req: any) {
    const job = await this.testprepQueue.getJob(id);
    if (!job) throw new NotFoundException('Job not found');
    // Authorization: a user can only poll their own jobs.
    if (job.data?.userId && job.data.userId !== req.user.userId) {
      throw new NotFoundException('Job not found');
    }
    const state = await job.getState();
    const out: Record<string, any> = {
      jobId: job.id,
      state, // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
      progress: job.progress || null,
      createdAt: job.timestamp,
    };
    if (state === 'completed') {
      // For 'report' jobs, redact the server-side disk path from the
      // polling response — clients fetch the PDF via GET /jobs/:id/pdf.
      if (job.name === 'report') {
        const r = (job.returnvalue || {}) as Record<string, any>;
        const { pdfPath: _drop, ...safe } = r;
        out.result = { ...safe, jobKind: 'report' };
      } else {
        out.result = job.returnvalue;
      }
    } else if (state === 'failed') {
      out.error = job.failedReason || 'analyze_failed';
    }
    return out;
  }

  @Post('ielts/report')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: audioStorage,
      fileFilter: audioFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async ieltsReport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      gender?: string;
      l1_language?: string;
      age_group?: string;
      name?: string;
      age?: string;
      centre_name?: string;
      registration_number?: string;
      test_date?: string;
      prompt_id?: string;
    },
    @Req() req: any,
  ): Promise<{ jobId: string; status: 'queued' }> {
    if (!file) throw new BadRequestException('Audio file is required');
    await this.ensureIeltsConsent(req.user.userId);
    await this.enforceMonthlyQuota(req.user.userId, 'report');
    this.audit.log('analysis_run', req.user.userId, req.user.email, {
      targetType: 'ielts_report',
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      metadata: { l1_language: body?.l1_language || 'auto' },
    });
    // Persist candidate profile fields back to the user document so the
    // next IELTS report pre-fills these values. Fire-and-forget — never
    // block the report on the profile save. test_date is intentionally
    // not saved (it changes per sitting).
    this.users
      .updateCandidateProfile(req.user.userId, {
        name: body?.name,
        age: body?.age,
        ielts_centre_name: body?.centre_name,
        registration_number: body?.registration_number,
      })
      .catch((err) =>
        this.logger.warn(`profile autosave failed for ${req.user.userId}: ${err?.message || err}`),
      );
    // Enqueue a 'report' job. The full pipeline + PDF render takes
    // 60-180s and was previously synchronous, which the Cloudflare
    // tunnel killed at ~100s ("NetworkError when attempting to fetch").
    // The worker writes the PDF to disk and the SPA polls /jobs/:id;
    // when state==='completed' it triggers GET /jobs/:id/pdf.
    const jobOpts: JobsOptions = {
      attempts: 1,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 200 },
    };
    const job = await this.testprepQueue.add(
      'report',
      {
        testType: 'ielts',
        filePath: file.path,
        fileMimeType: file.mimetype || 'audio/webm',
        fileOriginalName: file.originalname || 'audio.webm',
        userId: req.user.userId,
        userEmail: req.user.email || '',
        gender: body?.gender || 'neutral',
        l1_language: body?.l1_language || 'auto',
        prompt_id: body?.prompt_id || '',
        age_group: body?.age_group || 'adult',
        name: body?.name || 'Candidate',
        age: body?.age || '',
        centre_name: body?.centre_name || '',
        registration_number: body?.registration_number || '',
        test_date: body?.test_date || '',
      },
      jobOpts,
    );
    return { jobId: String(job.id), status: 'queued' };
  }

  /** Stream the generated PDF for a completed report job. The worker
   *  wrote it to <UPLOAD_DIR>/reports/<jobId>.pdf; we authorise on
   *  job ownership (same rule as GET /jobs/:id) before serving. */
  @Get('jobs/:id/pdf')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Download the PDF produced by a completed report job' })
  async getJobPdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const job = await this.testprepQueue.getJob(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.data?.userId && job.data.userId !== req.user.userId) {
      throw new NotFoundException('Job not found');
    }
    if (job.name !== 'report') {
      throw new BadRequestException('Job is not a report job');
    }
    const state = await job.getState();
    if (state !== 'completed') {
      throw new HttpException(
        { message: `Report not ready (state=${state})`, code: 'report_not_ready', state },
        409,
      );
    }
    const ret = job.returnvalue || {};
    const pdfPath = ret.pdfPath as string | undefined;
    const filename = (ret.filename as string | undefined) || `vaani_ielts_${job.id}.pdf`;
    if (!pdfPath) throw new NotFoundException('Report file missing');
    let size = 0;
    try { size = statSync(pdfPath).size; } catch {
      throw new NotFoundException('Report file no longer available');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(size));
    if (ret.band) res.setHeader('X-Vaani-Band-Overall', String(ret.band));
    createReadStream(pdfPath).pipe(res);
  }

  /** Quota + plan introspection. Lets the SPA render "2 of 3 mocks left this
   *  month" or a "Upgrade to download PDF reports" pill *before* the user
   *  hits the meter. Cheap (one count + one user lookup); poll-friendly.
   */
  @Get('quota')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Current user plan + monthly mock quota usage' })
  async quota(@Req() req: any) {
    const { plan, expired, expiresAt } = await this.users.getEffectivePlan(req.user.userId);
    const since = startOfCurrentMonthUtc();
    const used = await this.attempts.countForUserSince(req.user.userId, since);
    const isPaid = plan !== Plan.FREE;
    return {
      plan,
      planExpired: expired,
      planExpiresAt: expiresAt,
      monthly: {
        used,
        limit: isPaid ? null : FREE_TIER_MONTHLY_QUOTA,
        remaining: isPaid ? null : Math.max(0, FREE_TIER_MONTHLY_QUOTA - used),
        resetsAt: startOfNextMonthUtc().toISOString(),
        unlimited: isPaid,
      },
      features: {
        pdfReports: isPaid,
        clarityCoach: true,        // free + paid both keep coach access
        cifAttractor: true,        // free + paid both keep CIF analysis
        cohortDashboard: plan === Plan.CENTRE,
      },
      upgradeUrl: isPaid ? null : '/pricing',
    };
  }

  @Get('guidance/topics')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async guidanceTopics() {
    const res = await fetch(`${this.engineUrl}/api/guidance/topics`, {
      headers: this.engineHeaders(),
    });
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json();
  }

  @Get('guidance/node/:nodeId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async guidanceNode(@Query('nodeId') _q: string, @Req() req: any) {
    const nodeId = req.params?.nodeId;
    const res = await fetch(`${this.engineUrl}/api/guidance/node/${encodeURIComponent(nodeId)}`, {
      headers: this.engineHeaders(),
    });
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json();
  }

  @Post('guidance/ask')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async guidanceAsk(@Body() body: { query?: string; context?: any }) {
    if (!body?.query || typeof body.query !== 'string') {
      throw new BadRequestException('query is required');
    }
    try {
      const res = await fetch(`${this.engineUrl}/api/guidance/ask`, {
        method: 'POST',
        headers: this.engineHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: body.query, context: body.context || null }),
      });
      if (!res.ok) {
        this.logger.warn(`engine guidance/ask returned ${res.status}: ${await res.text()}`);
        return this.coachSoftFallback();
      }
      return await res.json();
    } catch (err: any) {
      // Engine unreachable / DNS / timeout — never bubble a 500 to the user.
      this.logger.error(`guidance/ask engine call failed: ${err?.message || err}`);
      return this.coachSoftFallback();
    }
  }

  private coachSoftFallback() {
    return {
      status: 'ok',
      node_id: '_fallback',
      category: 'general',
      title: 'Coach is catching its breath',
      answer:
        "I couldn't reach the Clarity engine just now. Try again in a moment, or rephrase — for example, ask about a specific IELTS criterion, a pronunciation issue, or what to expect in a particular Speaking part.",
      related: [],
      confidence: 0.0,
      personalised: false,
      fallback: true,
      neuro_active: false,
      neuro_configured: false,
    };
  }

  @Post('toefl/section-score')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async toeflSection(@Body() body: { task_scores: number[] }) {
    if (!Array.isArray(body?.task_scores)) {
      throw new BadRequestException('task_scores must be an array of 4 numbers');
    }
    const res = await fetch(`${this.engineUrl}/api/toefl/section-score`, {
      method: 'POST',
      headers: this.engineHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json();
  }

  // ── IELTS self-consent endpoints (DPDP Act 2023) ──────────────────────

  @Post('consent')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Record IELTS analysis consent for the authenticated user' })
  async recordConsent(
    @Body() body: { consentVersion?: string; consentTypes?: string[] } | undefined,
    @Req() req: any,
  ) {
    const validTypes = new Set<string>(Object.values(ConsentType));
    const requested = (body?.consentTypes || []).filter((t) => validTypes.has(t)) as ConsentType[];
    const record = await this.consent.recordIeltsConsent({
      userId: req.user.userId,
      email: req.user.email,
      name: req.user.name || req.user.email,
      consentTypes: requested.length > 0 ? requested : undefined,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      consentVersion: body?.consentVersion || '1.0',
    });
    this.audit.log('consent_granted', req.user.userId, req.user.email, {
      targetType: 'ielts_self_consent',
      targetId: String(record._id),
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      metadata: { consentVersion: record.consentVersion, consentTypes: record.consentTypes },
    });
    this.emailService
      .sendConsentReceipt(req.user.email, req.user.name || req.user.email, record.consentVersion, record.grantedAt)
      .catch((err) => this.logger.warn(`consent-receipt email failed: ${err?.message || err}`));
    return {
      status: 'ok',
      consentId: String(record._id),
      grantedAt: record.grantedAt,
      consentVersion: record.consentVersion,
      consentTypes: record.consentTypes,
    };
  }

  @Get('consent/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get the current user\'s IELTS consent status' })
  async consentStatus(@Req() req: any) {
    const record = await this.consent.getIeltsConsentStatus(req.user.userId);
    return {
      status: 'ok',
      hasConsent: !!record && record.granted && !record.revokedAt,
      grantedAt: record?.grantedAt || null,
      revokedAt: record?.revokedAt || null,
      consentVersion: record?.consentVersion || null,
      consentTypes: record?.consentTypes || [],
    };
  }

  @Post('consent/revoke')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Revoke IELTS consent for the authenticated user' })
  async revokeConsent(@Req() req: any) {
    await this.consent.revokeIeltsConsent(req.user.userId);
    this.audit.log('consent_revoked', req.user.userId, req.user.email, {
      targetType: 'ielts_self_consent',
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
    return { status: 'ok' };
  }

  private async proxyAnalyze(
    path: string,
    file: Express.Multer.File,
    fields: Record<string, string>,
  ): Promise<any> {
    const form = new FormData();
    const buf = readFileSync(file.path);
    const blob = new Blob([buf], { type: file.mimetype || 'audio/webm' });
    form.append('audio', blob, file.originalname);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);

    try {
      // 180-second cap on engine round-trip. Empirically the full pipeline
      // (Whisper + spaCy-trf + MLAF + CIF + IELTS rubric) takes 30-60s warm
      // for typical 60-90s audio, plus 30-40s cold-start the first request
      // after a restart. 180s absorbs cold + worst-case audio length without
      // false-positive timeouts. If the engine genuinely hangs, the watchdog
      // (60s probe with 30s budget) catches it independently — no user
      // request will sit longer than this 180s ceiling.
      // (Note: `Response` here is the WHATWG fetch Response, not Express's;
      //  let TS infer rather than annotating.)
      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await fetch(`${this.engineUrl}${path}`, {
          method: 'POST',
          headers: this.engineHeaders(),
          body: form,
          signal: AbortSignal.timeout(180_000),
        });
      } catch (err: any) {
        const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        this.logger.error(`engine ${path} unreachable: ${err?.message || err}`);
        throw new HttpException(
          {
            message: isTimeout
              ? 'The Vaani engine is busy — please retry in a moment. (If this keeps happening, the engine may be down.)'
              : 'The Vaani engine is currently unreachable. Try again in a minute.',
            code: isTimeout ? 'engine_timeout' : 'engine_down',
          },
          503,
        );
      }
      const text = await res.text();
      if (!res.ok) {
        this.logger.warn(`engine ${path} responded ${res.status}: ${text.slice(0, 400)}`);
        throw new HttpException(text, res.status);
      }
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } finally {
      try { unlinkSync(file.path); } catch {}
    }
  }
}
