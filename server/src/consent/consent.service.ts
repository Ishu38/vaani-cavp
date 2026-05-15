import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConsentRecord, ConsentType } from './consent.schema';
import { RequestConsentDto } from './consent.dto';

@Injectable()
export class ConsentService {
  constructor(
    @InjectModel(ConsentRecord.name) private consentModel: Model<ConsentRecord>,
  ) {}

  async requestConsent(
    dto: RequestConsentDto,
    teacherId: string,
    schoolId: string,
  ): Promise<ConsentRecord> {
    return this.consentModel.create({
      studentSpeakerId: dto.studentSpeakerId,
      parentEmail: dto.parentEmail,
      parentName: dto.parentName,
      consentTypes: dto.consentTypes || Object.values(ConsentType),
      granted: false,
      schoolId,
      requestedBy: teacherId,
    });
  }

  async verifyConsent(recordId: string): Promise<ConsentRecord> {
    const record = await this.consentModel.findByIdAndUpdate(
      recordId,
      { granted: true, grantedAt: new Date() },
      { new: true },
    ).exec();
    if (!record) {
      throw new Error('Consent record not found');
    }
    return record;
  }

  async revokeConsent(studentSpeakerId: string, schoolId: string): Promise<void> {
    await this.consentModel.updateMany(
      { studentSpeakerId, schoolId },
      { granted: false, revokedAt: new Date() },
    ).exec();
  }

  async getConsentStatus(studentSpeakerId: string, schoolId: string): Promise<ConsentRecord[]> {
    return this.consentModel
      .find({ studentSpeakerId, schoolId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Returns true if at least one granted consent exists,
   * OR if no consent records exist yet (backwards-compatible).
   */
  async isAnalysisAllowed(studentSpeakerId: string, schoolId: string): Promise<boolean> {
    const records = await this.consentModel
      .find({ studentSpeakerId, schoolId })
      .exec();

    // No consent records at all — backwards-compatible, allow analysis
    if (records.length === 0) {
      return true;
    }

    // At least one granted consent must exist
    return records.some((r) => r.granted);
  }

  /**
   * IELTS adult flow: self-consent keyed on the authenticated user's id.
   * Sentinel `schoolId='__ielts_self__'` distinguishes adult-self records
   * from school-cohort records that the existing helpers operate on.
   *
   * Unlike `isAnalysisAllowed`, this is *strict*: it requires an explicit
   * granted record. There is no backwards-compat fallback because every
   * paid IELTS candidate must affirmatively consent under DPDP Act 2023.
   */
  async isIeltsAnalysisAllowed(userId: string): Promise<boolean> {
    const record = await this.consentModel
      .findOne({ studentSpeakerId: userId, schoolId: IELTS_SELF_SCHOOL_ID, granted: true })
      .exec();
    return !!record && !record.revokedAt;
  }

  async recordIeltsConsent(opts: {
    userId: string;
    email: string;
    name: string;
    consentTypes?: ConsentType[];
    ipAddress?: string;
    userAgent?: string;
    consentVersion?: string;
  }): Promise<ConsentRecord> {
    return this.consentModel.create({
      studentSpeakerId: opts.userId,
      parentEmail: opts.email,
      parentName: opts.name,
      consentTypes:
        opts.consentTypes && opts.consentTypes.length > 0
          ? opts.consentTypes
          : [
              ConsentType.AUDIO_RECORDING,
              ConsentType.VOICE_ANALYSIS,
              ConsentType.DATA_STORAGE,
            ],
      granted: true,
      grantedAt: new Date(),
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      consentVersion: opts.consentVersion || '1.0',
      schoolId: IELTS_SELF_SCHOOL_ID,
      requestedBy: opts.userId,
    });
  }

  async revokeIeltsConsent(userId: string): Promise<void> {
    await this.consentModel
      .updateMany(
        { studentSpeakerId: userId, schoolId: IELTS_SELF_SCHOOL_ID },
        { granted: false, revokedAt: new Date() },
      )
      .exec();
  }

  async getIeltsConsentStatus(userId: string): Promise<ConsentRecord | null> {
    return this.consentModel
      .findOne({ studentSpeakerId: userId, schoolId: IELTS_SELF_SCHOOL_ID })
      .sort({ createdAt: -1 })
      .exec();
  }
}

export const IELTS_SELF_SCHOOL_ID = '__ielts_self__';
