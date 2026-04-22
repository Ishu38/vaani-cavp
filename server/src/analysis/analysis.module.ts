import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MulterModule } from '@nestjs/platform-express';
import { ProfilesModule } from '../profiles/profiles.module';
import { ConsentModule } from '../consent/consent.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AnalysisProcessor } from './analysis.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'analysis' }),
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }),
    ProfilesModule,
    ConsentModule,
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisProcessor],
})
export class AnalysisModule {}
