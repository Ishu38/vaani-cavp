import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VoiceProfile } from '../profiles/voice-profile.schema';
import { ContrastiveReport } from '../profiles/contrastive-report.schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RetentionCronService {
  private readonly logger = new Logger(RetentionCronService.name);
  private readonly retentionDays = 365;

  constructor(
    @InjectModel(VoiceProfile.name) private profileModel: Model<VoiceProfile>,
    @InjectModel(ContrastiveReport.name) private reportModel: Model<ContrastiveReport>,
    private audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleRetentionCleanup(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);

    this.logger.log(`Running data retention cleanup — deleting records older than ${cutoff.toISOString()}`);

    try {
      const [profiles, reports] = await Promise.all([
        this.profileModel.deleteMany({ createdAt: { $lt: cutoff } }).exec(),
        this.reportModel.deleteMany({ createdAt: { $lt: cutoff } }).exec(),
      ]);

      this.logger.log(
        `Retention cleanup complete: ${profiles.deletedCount} profiles, ${reports.deletedCount} reports deleted`,
      );

      if (profiles.deletedCount > 0 || reports.deletedCount > 0) {
        this.audit.log('data_deletion', 'system', 'system@vani.app', {
          targetType: 'retention_cleanup',
          metadata: {
            profilesDeleted: profiles.deletedCount,
            reportsDeleted: reports.deletedCount,
            cutoffDate: cutoff.toISOString(),
          },
        });
      }
    } catch (err) {
      this.logger.error(`Retention cleanup failed: ${err.message}`, err.stack);
    }
  }
}
