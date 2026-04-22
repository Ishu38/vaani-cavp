import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VoiceProfile, VoiceProfileSchema } from '../profiles/voice-profile.schema';
import { ContrastiveReport, ContrastiveReportSchema } from '../profiles/contrastive-report.schema';
import { ConsentRecord, ConsentRecordSchema } from '../consent/consent.schema';
import { ConsentModule } from '../consent/consent.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { RetentionCronService } from './retention.cron';
import { UploadCleanupCronService } from './upload-cleanup.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VoiceProfile.name, schema: VoiceProfileSchema },
      { name: ContrastiveReport.name, schema: ContrastiveReportSchema },
      { name: ConsentRecord.name, schema: ConsentRecordSchema },
    ]),
    ProfilesModule,
    ConsentModule,
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService, RetentionCronService, UploadCleanupCronService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
