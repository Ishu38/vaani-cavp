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
}
