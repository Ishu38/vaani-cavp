import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { VoiceProfile } from '../profiles/voice-profile.schema';
import { ContrastiveReport } from '../profiles/contrastive-report.schema';
import { ConsentRecord } from '../consent/consent.schema';
import { AuditService } from '../audit/audit.service';
import { IELTS_SELF_SCHOOL_ID } from '../consent/consent.service';

export interface DeletionResult {
  profiles: number;
  reports: number;
  consents: number;
  audioFiles: number;
}

export interface IeltsDeletionResult {
  consents: number;
  audioFiles: number;
}

export interface RetentionPolicy {
  dataRetentionDays: number;
  audioRetention: string;
  profileRetention: string;
}

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);
  private readonly uploadDir: string;

  constructor(
    @InjectModel(VoiceProfile.name) private profileModel: Model<VoiceProfile>,
    @InjectModel(ContrastiveReport.name) private reportModel: Model<ContrastiveReport>,
    @InjectModel(ConsentRecord.name) private consentModel: Model<ConsentRecord>,
    private audit: AuditService,
  ) {
    this.uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');
  }

  async deleteStudentData(
    studentSpeakerId: string,
    schoolId: string,
    requestedBy: { userId: string; email: string },
  ): Promise<DeletionResult> {
    // Collect audio filenames before DB deletion so we can sweep them off disk.
    const profileDocs = await this.profileModel
      .find({ speakerId: studentSpeakerId, schoolId }, { audioFilename: 1 })
      .lean()
      .exec();
    const audioFilenames = profileDocs
      .map((p: any) => p.audioFilename)
      .filter((f: any): f is string => typeof f === 'string' && f.length > 0);

    const [profiles, reports, consents] = await Promise.all([
      this.profileModel.deleteMany({ speakerId: studentSpeakerId, schoolId }).exec(),
      this.reportModel.deleteMany({ speakerId: studentSpeakerId, schoolId }).exec(),
      this.consentModel.deleteMany({ studentSpeakerId, schoolId }).exec(),
    ]);

    const audioFiles = await this.deleteAudioFiles(audioFilenames);

    const result: DeletionResult = {
      profiles: profiles.deletedCount,
      reports: reports.deletedCount,
      consents: consents.deletedCount,
      audioFiles,
    };

    this.audit.log('data_deletion', requestedBy.userId, requestedBy.email, {
      targetId: studentSpeakerId,
      targetType: 'student',
      schoolId,
      metadata: { deleted: result },
    });

    return result;
  }

  /**
   * IELTS adult right-to-deletion. The IELTS flow (testprep) does not persist
   * VoiceProfile or ContrastiveReport rows — analysis is fire-and-forget — so
   * the only DB residue per user is consent records (sentinel schoolId) plus
   * any in-flight audio in the uploads dir from a request that crashed before
   * its `unlinkSync` finally fired. We sweep both.
   *
   * Returning the counts lets the candidate verify their request was honored.
   */
  async deleteIeltsUserData(
    userId: string,
    requestedBy: { userId: string; email: string },
  ): Promise<IeltsDeletionResult> {
    const consents = await this.consentModel
      .deleteMany({ studentSpeakerId: userId, schoolId: IELTS_SELF_SCHOOL_ID })
      .exec();

    // Best-effort sweep: anything in uploads/ matching this user's stored
    // profile audioFilenames (in case profile rows ever start persisting),
    // PLUS testprep stragglers older than 5 minutes (request must be done
    // by then, so any stragglers are unambiguous orphans).
    const profileDocs = await this.profileModel
      .find({ speakerId: userId }, { audioFilename: 1 })
      .lean()
      .exec();
    const audioFilenames = profileDocs
      .map((p: any) => p.audioFilename)
      .filter((f: any): f is string => typeof f === 'string' && f.length > 0);
    const audioFiles = await this.deleteAudioFiles(audioFilenames);

    const result: IeltsDeletionResult = {
      consents: consents.deletedCount,
      audioFiles,
    };

    this.audit.log('data_deletion', requestedBy.userId, requestedBy.email, {
      targetId: userId,
      targetType: 'ielts_self',
      metadata: { deleted: result },
    });

    return result;
  }

  /** Best-effort: unlink each filename inside the upload dir; missing files
   * are not errors. Path traversal protected by basename normalization. */
  private async deleteAudioFiles(filenames: string[]): Promise<number> {
    let n = 0;
    for (const raw of filenames) {
      // Reduce to a basename to defeat any path-traversal payloads from
      // poisoned data; never let a stored filename escape the upload dir.
      const name = raw.replace(/[/\\]/g, '').slice(0, 255);
      if (!name) continue;
      const target = join(this.uploadDir, name);
      try {
        await fsp.unlink(target);
        n++;
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          this.logger.warn(`audio unlink failed for ${name}: ${err?.message || err}`);
        }
      }
    }
    return n;
  }

  getRetentionPolicy(): RetentionPolicy {
    return {
      dataRetentionDays: 365,
      audioRetention: 'deleted_after_processing',
      profileRetention: '365_days',
    };
  }
}
