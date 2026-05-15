import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Agent, fetch as undiciFetch, FormData as UndiciFormData } from 'undici';
import { AttemptsService } from '../attempts/attempts.service';

// Node's bundled fetch (undici) defaults headersTimeout + bodyTimeout to 300s.
// Vaani's pipeline can run 3-4 min on long Praat-heavy audio, which trips that
// 5-min cap *before* our AbortSignal.timeout(600_000) ever fires — surfacing as
// the opaque `TypeError: fetch failed`. Using a dedicated dispatcher with the
// timeouts widened to 600s lets the AbortSignal be the real ceiling.
const longRunDispatcher = new Agent({
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
  connect: { timeout: 30_000 },
});

/**
 * Job payload — what the controller enqueues. We pass the file path on
 * disk (multer wrote it during the upload) plus the user/test metadata so
 * the worker can call the engine and persist the attempt without holding
 * the HTTP request open.
 *
 * `userId` is required (analyze is JWT-only); auto-save happens here too.
 *
 * Report-specific fields (name/age/centre_name/registration_number/test_date/
 * age_group) are only read when job.name === 'report'.
 */
export interface TestPrepJobData {
  testType: 'ielts' | 'toefl';
  filePath: string;
  fileMimeType: string;
  fileOriginalName: string;
  userId: string;
  userEmail: string;
  // Form fields the controller previously forwarded inline.
  gender: string;
  l1_language: string;
  prompt_id: string;
  task_number?: string;
  // Report-only fields
  age_group?: string;
  name?: string;
  age?: string;
  centre_name?: string;
  registration_number?: string;
  test_date?: string;
}

/**
 * Worker that picks up enqueued analyze jobs and runs them through the
 * engine. Decouples the user's HTTP submit from the engine's 30-90s
 * pipeline — controllers return immediately with a jobId, this processor
 * does the slow work in the background, results are stored as the job's
 * return value (BullMQ persists to Redis with the configured TTL).
 *
 * concurrency: 1 — engine itself runs --workers 1 on a 6 GB GPU; queueing
 * more than one job at a time inside Nest just means engine-side queueing.
 * Keeping it 1 here makes back-pressure visible (job state stays "waiting"
 * which the SPA can render).
 */
@Processor('testprep', { concurrency: 1 })
export class TestPrepProcessor extends WorkerHost {
  private readonly logger = new Logger(TestPrepProcessor.name);
  private readonly engineUrl: string;
  private readonly engineApiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly attempts: AttemptsService,
  ) {
    super();
    this.engineUrl = this.config.get<string>('FASTAPI_URL', 'http://localhost:8000');
    this.engineApiKey = this.config.get<string>('ENGINE_API_KEY', '');
  }

  async process(job: Job<TestPrepJobData>): Promise<any> {
    const data = job.data;
    if (job.name === 'report') {
      return this.processReport(job);
    }
    this.logger.log(`processing ${data.testType} job ${job.id} for user=${data.userId}`);

    const path = data.testType === 'ielts' ? '/api/ielts/analyze' : '/api/toefl/analyze';
    await job.updateProgress({ stage: 'forwarding_to_engine', percent: 5 });

    const form = new UndiciFormData();
    const buf = readFileSync(data.filePath);
    const blob = new Blob([buf], { type: data.fileMimeType || 'audio/webm' });
    form.append('audio', blob, data.fileOriginalName);
    form.append('gender', data.gender || 'neutral');
    form.append('l1_language', data.l1_language || 'auto');
    form.append('prompt_id', data.prompt_id || '');
    if (data.testType === 'toefl') {
      form.append('task_number', data.task_number || '1');
    }

    const headers: Record<string, string> = {};
    if (this.engineApiKey) headers['X-Engine-API-Key'] = this.engineApiKey;

    let result: any;
    try {
      // 600s ceiling — accommodates the full neuro-symbolic pipeline at
      // its slowest (Praat-heavy 90s audio can take 3-4 min when run
      // serially through every layer) plus cold-start margin. Async
      // queue means the user isn't holding an HTTP connection — they
      // poll /jobs/:id every 2s. This 600s cap is purely a circuit
      // breaker against zombie engines, not a UX deadline. The custom
      // dispatcher above raises undici's 300s default so this AbortSignal
      // is the real timeout, not the transport layer.
      const res = await undiciFetch(`${this.engineUrl}${path}`, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(600_000),
        dispatcher: longRunDispatcher,
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.warn(`engine ${path} responded ${res.status}: ${text.slice(0, 400)}`);
        throw new Error(`engine returned ${res.status}: ${text.slice(0, 200)}`);
      }
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      this.logger.error(`engine ${path} failed: ${err?.message || err}`);
      throw new Error(
        isTimeout
          ? 'engine_timeout: scoring took longer than 600 seconds'
          : `engine_error: ${err?.message || 'unreachable'}`,
      );
    } finally {
      try { unlinkSync(data.filePath); } catch {}
    }

    await job.updateProgress({ stage: 'persisting_attempt', percent: 90 });

    // Auto-save attempt (mirrors the inline persistAttempt logic in the
    // synchronous controller path). Strips predicted_substitutions per
    // CAVP acoustic-only policy.
    try {
      const ielts = result?.ielts || result?.toefl || {};
      const profile = result?.profile || {};
      const cif = profile?.cif_analysis || {};
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
      await this.attempts.create({
        userId: data.userId,
        testType: data.testType,
        bandOverall: ielts?.overall_band != null ? String(ielts.overall_band) : undefined,
        bands: ielts || {},
        acoustic,
        transcript,
        promptId: data.prompt_id || undefined,
        l1Language: data.l1_language || undefined,
        feedback: { notes: ielts?.notes || [] },
      });
    } catch (err: any) {
      this.logger.warn(`attempt autosave failed: ${err?.message || err}`);
    }

    await job.updateProgress({ stage: 'done', percent: 100 });
    return result;
  }

  /** Reports dir for generated PDFs. Sibling of the audio uploads dir so
   *  it inherits the same volume. Created lazily — multer creates uploadDir
   *  on its own, but the reports subdir doesn't exist until first use. */
  private reportsDir(): string {
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');
    const dir = join(uploadDir, 'reports');
    try { mkdirSync(dir, { recursive: true }); } catch {}
    return dir;
  }

  /** Variant of process() for the IELTS PDF report flow. Mirrors the
   *  controller's previous synchronous implementation but runs in the
   *  worker so the HTTP request returns immediately with a jobId. The
   *  generated PDF is written to disk (reports/<jobId>.pdf) and the
   *  GET /jobs/:id/pdf endpoint streams it back to the candidate. */
  private async processReport(job: Job<TestPrepJobData>): Promise<any> {
    const data = job.data;
    this.logger.log(`processing report job ${job.id} for user=${data.userId}`);
    await job.updateProgress({ stage: 'forwarding_to_engine', percent: 5 });

    const form = new UndiciFormData();
    const buf = readFileSync(data.filePath);
    const blob = new Blob([buf], { type: data.fileMimeType || 'audio/webm' });
    form.append('audio', blob, data.fileOriginalName);
    form.append('gender', data.gender || 'neutral');
    form.append('l1_language', data.l1_language || 'auto');
    form.append('age_group', data.age_group || 'adult');
    form.append('name', data.name || 'Candidate');
    form.append('age', data.age || '');
    form.append('centre_name', data.centre_name || '');
    form.append('registration_number', data.registration_number || '');
    form.append('test_date', data.test_date || '');
    form.append('prompt_id', data.prompt_id || '');

    const headers: Record<string, string> = {};
    if (this.engineApiKey) headers['X-Engine-API-Key'] = this.engineApiKey;

    let pdfBytes: Uint8Array;
    let band = '';
    let suggestedFilename = `vaani_ielts_${job.id}.pdf`;
    try {
      const res = await undiciFetch(`${this.engineUrl}/api/ielts/report`, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(600_000),
        dispatcher: longRunDispatcher,
      });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(`engine /api/ielts/report ${res.status}: ${errText.slice(0, 400)}`);
        throw new Error(`engine returned ${res.status}: ${errText.slice(0, 200)}`);
      }
      pdfBytes = new Uint8Array(await res.arrayBuffer());
      band = res.headers.get('x-vaani-band-overall') || '';
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^";]+)/);
      if (m) suggestedFilename = m[1];
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      this.logger.error(`engine /api/ielts/report failed: ${err?.message || err}`);
      throw new Error(
        isTimeout
          ? 'engine_timeout: report generation took longer than 600 seconds'
          : `engine_error: ${err?.message || 'unreachable'}`,
      );
    } finally {
      try { unlinkSync(data.filePath); } catch {}
    }

    await job.updateProgress({ stage: 'writing_pdf', percent: 95 });
    const pdfPath = join(this.reportsDir(), `${job.id}.pdf`);
    try {
      mkdirSync(dirname(pdfPath), { recursive: true });
    } catch {}
    writeFileSync(pdfPath, pdfBytes);

    await job.updateProgress({ stage: 'done', percent: 100 });
    return {
      pdfReady: true,
      pdfPath,                  // absolute disk path (server-only; not exposed in jobs/:id)
      filename: suggestedFilename,
      band,
      sizeBytes: pdfBytes.length,
    };
  }
}
