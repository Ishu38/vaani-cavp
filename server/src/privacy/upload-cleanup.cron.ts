import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

@Injectable()
export class UploadCleanupCronService {
  private readonly logger = new Logger(UploadCleanupCronService.name);
  private readonly uploadDir: string;
  private readonly maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours

  constructor(private config: ConfigService) {
    this.uploadDir = this.config.get('UPLOAD_DIR', join(process.cwd(), '..', 'uploads'));
  }

  @Cron(CronExpression.EVERY_HOUR)
  handleUploadCleanup(): void {
    this.logger.log('Running upload directory cleanup...');

    try {
      const now = Date.now();
      let deleted = 0;

      const files = readdirSync(this.uploadDir);
      for (const file of files) {
        const filePath = join(this.uploadDir, file);
        try {
          const stat = statSync(filePath);
          if (stat.isFile() && now - stat.mtimeMs > this.maxAgeMs) {
            unlinkSync(filePath);
            deleted++;
          }
        } catch {
          // File may have been deleted between readdir and stat
        }
      }

      if (deleted > 0) {
        this.logger.log(`Upload cleanup: removed ${deleted} stale files`);
      }
    } catch (err) {
      this.logger.error(`Upload cleanup failed: ${err.message}`);
    }
  }
}
