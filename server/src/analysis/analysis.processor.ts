import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { ProfilesService } from '../profiles/profiles.service';

/** Engine request timeout — 5 minutes for full pipeline */
const ENGINE_TIMEOUT_MS = 5 * 60 * 1000;

export interface AnalysisJobData {
  type: 'single' | 'contrastive';
  filePath: string;
  filePathB?: string;
  gender: string;
  language?: string;
  speakerId?: string;
  studentName?: string;
  schoolId?: string;
  teacherId?: string;
  opensmile?: boolean;
  speechbrain?: boolean;
  labelA?: string;
  labelB?: string;
  l1Language?: string;
}

export interface AnalysisJobResult {
  profileId?: string;
  reportId?: string;
  profileAId?: string;
  profileBId?: string;
  error?: string;
}

@Processor('analysis', { concurrency: 2 })
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);
  private readonly engineUrl: string;

  private readonly engineApiKey: string;

  constructor(
    private config: ConfigService,
    private profiles: ProfilesService,
  ) {
    super();
    this.engineUrl = this.config.get('FASTAPI_URL', 'http://localhost:8000');
    this.engineApiKey = this.config.get('ENGINE_API_KEY', '');
  }

  async process(job: Job<AnalysisJobData>): Promise<AnalysisJobResult> {
    const { data } = job;
    this.logger.log(`Processing job ${job.id} — type=${data.type}`);

    try {
      if (data.type === 'single') {
        return await this.processSingle(job);
      } else {
        return await this.processContrastive(job);
      }
    } catch (err) {
      this.logger.error(`Job ${job.id} failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  private async processSingle(job: Job<AnalysisJobData>): Promise<AnalysisJobResult> {
    const { data } = job;
    const fs = await import('fs');
    const path = await import('path');

    try {
      await job.updateProgress(10);

      const fileBuffer = fs.readFileSync(data.filePath);
      const filename = path.basename(data.filePath);

      const formData = new FormData();
      formData.append('audio', new Blob([fileBuffer]), filename);
      formData.append('gender', data.gender || 'neutral');
      formData.append('run_opensmile', data.opensmile ? 'true' : 'false');
      formData.append('run_speechbrain', data.speechbrain ? 'true' : 'false');
      if (data.l1Language) formData.append('l1_language', data.l1Language);

      await job.updateProgress(20);

      const response = await fetch(`${this.engineUrl}/api/analyze`, {
        method: 'POST',
        body: formData,
        headers: this.engineApiKey ? { 'X-Engine-API-Key': this.engineApiKey } : {},
        signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Engine returned ${response.status}: ${errBody}`);
      }

      await job.updateProgress(80);

      const result = await response.json();
      const engineProfile = result.profile;

      // Save to MongoDB via ProfilesService
      const saved = await this.profiles.saveProfile(engineProfile, {
        speakerId: data.speakerId,
        teacherId: data.teacherId,
        schoolId: data.schoolId,
        studentName: data.studentName,
        audioFilename: filename,
        language: data.language,
        gender: data.gender,
      });

      await job.updateProgress(100);

      // Clean up only after successful save — keep file for retries on failure
      this.cleanupFile(data.filePath);

      return { profileId: saved._id.toString() };
    } catch (err) {
      // On final attempt, clean up the file even on failure to prevent orphans
      if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
        this.cleanupFile(data.filePath);
      }
      throw err;
    }
  }

  private async processContrastive(job: Job<AnalysisJobData>): Promise<AnalysisJobResult> {
    const { data } = job;
    const fs = await import('fs');
    const path = await import('path');

    try {
      await job.updateProgress(10);

      const fileBufferA = fs.readFileSync(data.filePath);
      const fileBufferB = fs.readFileSync(data.filePathB!);
      const filenameA = path.basename(data.filePath);
      const filenameB = path.basename(data.filePathB!);

      const formData = new FormData();
      formData.append('audio_a', new Blob([fileBufferA]), filenameA);
      formData.append('audio_b', new Blob([fileBufferB]), filenameB);
      formData.append('gender', data.gender || 'neutral');
      formData.append('label_a', data.labelA || 'L1');
      formData.append('label_b', data.labelB || 'L2 (English)');
      if (data.l1Language) formData.append('l1_language', data.l1Language);

      await job.updateProgress(20);

      const response = await fetch(`${this.engineUrl}/api/contrastive`, {
        method: 'POST',
        body: formData,
        headers: this.engineApiKey ? { 'X-Engine-API-Key': this.engineApiKey } : {},
        signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Engine returned ${response.status}: ${errBody}`);
      }

      await job.updateProgress(80);

      const result = await response.json();

      // Save both profiles
      const meta = {
        speakerId: data.speakerId,
        teacherId: data.teacherId,
        schoolId: data.schoolId,
        studentName: data.studentName,
        language: data.language,
        gender: data.gender,
      };

      const profileA = await this.profiles.saveProfile(result.profile_a, {
        ...meta,
        audioFilename: filenameA,
      });
      const profileB = await this.profiles.saveProfile(result.profile_b, {
        ...meta,
        audioFilename: filenameB,
      });

      // Save contrastive report
      const report = await this.profiles.saveContrastiveReport(
        profileA._id.toString(),
        profileB._id.toString(),
        result.contrastive_report,
        {
          ...meta,
          labelA: data.labelA,
          labelB: data.labelB,
        },
      );

      await job.updateProgress(100);

      // Clean up only after successful save
      this.cleanupFile(data.filePath);
      this.cleanupFile(data.filePathB);

      return {
        reportId: report._id.toString(),
        profileAId: profileA._id.toString(),
        profileBId: profileB._id.toString(),
      };
    } catch (err) {
      // On final attempt, clean up files even on failure to prevent orphans
      if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
        this.cleanupFile(data.filePath);
        this.cleanupFile(data.filePathB);
      }
      throw err;
    }
  }

  private cleanupFile(filePath?: string): void {
    if (!filePath) return;
    try {
      const fs = require('fs');
      fs.unlinkSync(filePath);
    } catch (e) {
      this.logger.warn(`Failed to clean up ${filePath}: ${e.message}`);
    }
  }
}
