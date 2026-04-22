import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { RolesGuard } from '../auth/roles.guard';
import { TierGuard } from '../subscription/tier.guard';
import { AnalysisThrottleGuard } from './analysis-throttle.guard';
import { SubscriptionService } from '../subscription/subscription.service';
import { AnalysisService } from './analysis.service';
import { ConsentService } from '../consent/consent.service';
import { AuditService } from '../audit/audit.service';
import { SubmitAnalysisDto, SubmitBatchDto, SubmitContrastiveDto } from './dto/analysis.dto';

const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');

const audioStorage = diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
  },
});

const audioFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = ['.wav', '.mp3', '.ogg', '.webm', '.flac', '.m4a'];
  const ext = extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported audio format: ${ext}`), false);
  }
};

@ApiTags('Analysis')
@Controller('api/analysis')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AnalysisController {
  constructor(
    private analysis: AnalysisService,
    private consent: ConsentService,
    private audit: AuditService,
    private subscription: SubscriptionService,
  ) {}

  @Post('submit')
  @UseGuards(TierGuard, AnalysisThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 300000 } })
  @ApiOperation({ summary: 'Submit a single audio file for analysis (returns job ID)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: audioStorage,
      fileFilter: audioFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async submitSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SubmitAnalysisDto,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('Audio file is required');

    // Consent gate
    if (dto.speakerId) {
      const allowed = await this.consent.isAnalysisAllowed(dto.speakerId, req.user.schoolId);
      if (!allowed) throw new ForbiddenException('Parental consent required before analyzing this student');
    }

    const result = await this.analysis.submitSingle(file.path, {
      gender: dto.gender,
      language: dto.language,
      speakerId: dto.speakerId,
      studentName: dto.studentName,
      schoolId: req.user.schoolId, // Always use JWT — never trust user input
      teacherId: req.user.userId,
      opensmile: dto.opensmile,
      speechbrain: dto.speechbrain,
      l1Language: dto.l1Language,
    });

    // Increment usage counter after successful submission
    await this.subscription.incrementUsage(req.user.schoolId);

    this.audit.log('analysis_run', req.user.userId, req.user.email, {
      targetId: result.jobId,
      targetType: 'analysis',
      schoolId: req.user.schoolId,
    });

    return result;
  }

  @Post('batch')
  @UseGuards(TierGuard, AnalysisThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @ApiOperation({ summary: 'Submit up to 10 audio files for batch analysis (returns job IDs)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('audios', 10, {
      storage: audioStorage,
      fileFilter: audioFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async submitBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: SubmitBatchDto,
    @Request() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one audio file is required');
    }

    // Consent gate
    if (dto.speakerId) {
      const allowed = await this.consent.isAnalysisAllowed(dto.speakerId, req.user.schoolId);
      if (!allowed) throw new ForbiddenException('Parental consent required before analyzing this student');
    }

    const jobIds: string[] = [];

    for (const file of files) {
      const result = await this.analysis.submitSingle(file.path, {
        gender: dto.gender,
        language: dto.language,
        speakerId: dto.speakerId,
        studentName: dto.studentName,
        schoolId: req.user.schoolId,
        teacherId: req.user.userId,
        opensmile: dto.opensmile,
        speechbrain: dto.speechbrain,
        l1Language: dto.l1Language,
      });

      jobIds.push(result.jobId);

      // Increment usage counter for each file
      await this.subscription.incrementUsage(req.user.schoolId);
    }

    // Log one audit entry for the entire batch
    this.audit.log('batch_analysis_run', req.user.userId, req.user.email, {
      targetId: jobIds.join(','),
      targetType: 'batch_analysis',
      schoolId: req.user.schoolId,
      metadata: { fileCount: files.length },
    });

    return { jobIds };
  }

  @Post('contrastive')
  @UseGuards(TierGuard, AnalysisThrottleGuard)
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @ApiOperation({ summary: 'Submit two audio files for contrastive analysis (returns job ID)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio_a', maxCount: 1 },
        { name: 'audio_b', maxCount: 1 },
      ],
      { storage: audioStorage, fileFilter: audioFileFilter, limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async submitContrastive(
    @UploadedFiles() files: { audio_a?: Express.Multer.File[]; audio_b?: Express.Multer.File[] },
    @Body() dto: SubmitContrastiveDto,
    @Request() req: any,
  ) {
    const fileA = files.audio_a?.[0];
    const fileB = files.audio_b?.[0];
    if (!fileA || !fileB) {
      throw new BadRequestException('Both audio_a and audio_b files are required');
    }

    // Consent gate
    if (dto.speakerId) {
      const allowed = await this.consent.isAnalysisAllowed(dto.speakerId, req.user.schoolId);
      if (!allowed) throw new ForbiddenException('Parental consent required before analyzing this student');
    }

    const result = await this.analysis.submitContrastive(fileA.path, fileB.path, {
      gender: dto.gender,
      speakerId: dto.speakerId,
      studentName: dto.studentName,
      schoolId: req.user.schoolId, // Always use JWT — never trust user input
      teacherId: req.user.userId,
      labelA: dto.labelA,
      labelB: dto.labelB,
      l1Language: dto.l1Language,
    });

    // Increment usage counter after successful submission
    await this.subscription.incrementUsage(req.user.schoolId);

    this.audit.log('analysis_run', req.user.userId, req.user.email, {
      targetId: result.jobId,
      targetType: 'analysis',
      schoolId: req.user.schoolId,
    });

    return result;
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Poll job status by ID' })
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.analysis.getJobStatus(jobId);
  }
}
