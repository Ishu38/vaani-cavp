import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VoiceProfile, VoiceProfileSchema } from './voice-profile.schema';
import { ContrastiveReport, ContrastiveReportSchema } from './contrastive-report.schema';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VoiceProfile.name, schema: VoiceProfileSchema },
      { name: ContrastiveReport.name, schema: ContrastiveReportSchema },
    ]),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
