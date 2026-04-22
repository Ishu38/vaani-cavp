import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VoiceProfile } from '../profiles/voice-profile.schema';
import { ContrastiveReport } from '../profiles/contrastive-report.schema';
import { ConsentRecord } from '../consent/consent.schema';
import { AuditService } from '../audit/audit.service';

export interface DeletionResult {
  profiles: number;
  reports: number;
  consents: number;
}

export interface RetentionPolicy {
  dataRetentionDays: number;
  audioRetention: string;
  profileRetention: string;
}

@Injectable()
export class PrivacyService {
  constructor(
    @InjectModel(VoiceProfile.name) private profileModel: Model<VoiceProfile>,
    @InjectModel(ContrastiveReport.name) private reportModel: Model<ContrastiveReport>,
    @InjectModel(ConsentRecord.name) private consentModel: Model<ConsentRecord>,
    private audit: AuditService,
  ) {}

  async deleteStudentData(
    studentSpeakerId: string,
    schoolId: string,
    requestedBy: { userId: string; email: string },
  ): Promise<DeletionResult> {
    const [profiles, reports, consents] = await Promise.all([
      this.profileModel.deleteMany({ speakerId: studentSpeakerId, schoolId }).exec(),
      this.reportModel.deleteMany({ speakerId: studentSpeakerId, schoolId }).exec(),
      this.consentModel.deleteMany({ studentSpeakerId, schoolId }).exec(),
    ]);

    const result: DeletionResult = {
      profiles: profiles.deletedCount,
      reports: reports.deletedCount,
      consents: consents.deletedCount,
    };

    this.audit.log('data_deletion', requestedBy.userId, requestedBy.email, {
      targetId: studentSpeakerId,
      targetType: 'student',
      schoolId,
      metadata: { deleted: result },
    });

    return result;
  }

  getRetentionPolicy(): RetentionPolicy {
    return {
      dataRetentionDays: 365,
      audioRetention: 'deleted_after_processing',
      profileRetention: '365_days',
    };
  }
}
