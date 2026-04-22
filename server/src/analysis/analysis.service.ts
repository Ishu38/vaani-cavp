import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { AnalysisJobData } from './analysis.processor';

/** Shared job options: retry 3 times with exponential backoff, auto-cleanup */
const JOB_DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 200 },   // keep completed jobs 24h, max 200
  removeOnFail: { age: 7 * 86400, count: 500 },    // keep failed jobs 7 days for inspection
};

@Injectable()
export class AnalysisService {
  constructor(@InjectQueue('analysis') private analysisQueue: Queue) {}

  async submitSingle(
    filePath: string,
    meta: Partial<AnalysisJobData>,
  ): Promise<{ jobId: string }> {
    const job = await this.analysisQueue.add('analyze', {
      type: 'single' as const,
      filePath,
      gender: meta.gender || 'neutral',
      language: meta.language,
      speakerId: meta.speakerId,
      studentName: meta.studentName,
      schoolId: meta.schoolId,
      teacherId: meta.teacherId,
      opensmile: meta.opensmile || false,
      speechbrain: meta.speechbrain || false,
      l1Language: meta.l1Language,
    } satisfies AnalysisJobData, JOB_DEFAULTS);

    return { jobId: job.id! };
  }

  async submitContrastive(
    filePathA: string,
    filePathB: string,
    meta: Partial<AnalysisJobData>,
  ): Promise<{ jobId: string }> {
    const job = await this.analysisQueue.add('contrastive', {
      type: 'contrastive' as const,
      filePath: filePathA,
      filePathB: filePathB,
      gender: meta.gender || 'neutral',
      speakerId: meta.speakerId,
      studentName: meta.studentName,
      schoolId: meta.schoolId,
      teacherId: meta.teacherId,
      labelA: meta.labelA,
      labelB: meta.labelB,
      l1Language: meta.l1Language,
    } satisfies AnalysisJobData, JOB_DEFAULTS);

    return { jobId: job.id! };
  }

  async getJobStatus(jobId: string) {
    const job = await this.analysisQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');

    const state = await job.getState();
    const progress = job.progress;

    const result: Record<string, any> = {
      jobId: job.id,
      state,
      progress,
      createdAt: job.timestamp,
    };

    if (state === 'completed') {
      result.result = job.returnvalue;
    } else if (state === 'failed') {
      result.error = 'Analysis failed';
      result.failedReason = job.failedReason;
      result.attemptsMade = job.attemptsMade;
    }

    return result;
  }
}
