import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VoiceProfile } from './voice-profile.schema';
import { ContrastiveReport } from './contrastive-report.schema';

export interface RequestUser {
  userId: string;
  email: string;
  role: string;
  school: string;
  schoolId: string;
}

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(VoiceProfile.name) private profileModel: Model<VoiceProfile>,
    @InjectModel(ContrastiveReport.name) private reportModel: Model<ContrastiveReport>,
  ) {}

  /** Returns true if the user is admin or belongs to the given school */
  private assertSchoolAccess(user: RequestUser, schoolId: string): void {
    if (user.role === 'admin') return;
    if (!schoolId || user.schoolId !== schoolId) {
      throw new ForbiddenException('Access denied: you can only access data from your own school');
    }
  }

  // ── Voice Profiles ──

  async saveProfile(engineResult: Record<string, any>, meta: Record<string, any>): Promise<VoiceProfile> {
    return this.profileModel.create({
      speakerId: meta.speakerId || 'anonymous',
      teacherId: meta.teacherId,
      schoolId: meta.schoolId,
      studentName: meta.studentName,
      sessionId: meta.sessionId || `session_${Date.now()}`,
      audioFilename: meta.audioFilename,
      language: meta.language || 'en',
      gender: meta.gender || 'neutral',
      transcription: engineResult.transcription,
      featureExtraction: engineResult.feature_extraction,
      aiClassification: engineResult.ai_classification,
      nlp: engineResult.nlp,
      phonemeAnalysis: engineResult.phoneme_analysis,
      morphemeBoundary: engineResult.morpheme_boundary,
      prosodicProfile: engineResult.prosodic_profile,
      connectedSpeech: engineResult.connected_speech,
      voiceQuality: engineResult.voice_quality,
      l1Interference: engineResult.l1_interference || engineResult.bhojpuri_interference,
      bhojpuriInterference: engineResult.bhojpuri_interference,
      l1Language: engineResult.l1_language || 'bho',
      l1DisplayName: engineResult.l1_display_name || 'Bhojpuri',
      cifAnalysis: engineResult.cif_analysis,
      processingTimeMs: engineResult.processing_time_ms,
    });
  }

  async findById(id: string, user?: RequestUser): Promise<VoiceProfile> {
    const profile = await this.profileModel.findOne({ _id: id }).exec();
    if (!profile) throw new NotFoundException('Profile not found');
    if (user) this.assertSchoolAccess(user, profile.schoolId);
    return profile;
  }

  async getTrajectory(speakerId: string, limit = 100, user?: RequestUser) {
    const query: Record<string, any> = { speakerId };
    // Non-admin users can only see trajectories within their own school
    if (user && user.role !== 'admin') {
      query.schoolId = user.schoolId;
    }
    return this.profileModel
      .find(query)
      .sort({ createdAt: -1 })
      .select({
        'transcription.text': 1,
        phonemeAnalysis: 1,
        prosodicProfile: 1,
        connectedSpeech: 1,
        voiceQuality: 1,
        morphemeBoundary: 1,
        cifAnalysis: 1,
        processingTimeMs: 1,
        createdAt: 1,
        audioFilename: 1,
        studentName: 1,
        schoolId: 1,
      })
      .limit(Math.min(limit, 500))
      .exec();
  }

  async getSchoolProfiles(schoolId: string, limit = 200) {
    // Access control is enforced in the controller before calling this
    return this.profileModel
      .find({ schoolId })
      .sort({ createdAt: -1 })
      .select({
        speakerId: 1,
        studentName: 1,
        'cifAnalysis.overall_cii': 1,
        'cifAnalysis.overall_severity': 1,
        'phonemeAnalysis.overall_accuracy': 1,
        processingTimeMs: 1,
        createdAt: 1,
      })
      .limit(Math.min(limit, 500))
      .exec();
  }

  // ── Contrastive Reports ──

  async saveContrastiveReport(
    profileAId: string,
    profileBId: string,
    contrastiveData: Record<string, any>,
    meta: Record<string, any>,
  ): Promise<ContrastiveReport> {
    return this.reportModel.create({
      speakerId: meta.speakerId || 'anonymous',
      teacherId: meta.teacherId,
      schoolId: meta.schoolId,
      profileA: profileAId,
      profileB: profileBId,
      labelA: meta.labelA || 'L1 (Bhojpuri)',
      labelB: meta.labelB || 'L2 (English)',
      contrastiveData,
    });
  }

  async findReportById(id: string, user?: RequestUser): Promise<ContrastiveReport> {
    const report = await this.reportModel
      .findOne({ _id: id })
      .populate('profileA')
      .populate('profileB')
      .exec();
    if (!report) throw new NotFoundException('Report not found');
    if (user) this.assertSchoolAccess(user, report.schoolId);
    return report;
  }

  async getReportsBySpeaker(speakerId: string, user?: RequestUser, limit = 50) {
    const query: Record<string, any> = { speakerId };
    // Non-admin users can only see reports within their own school
    if (user && user.role !== 'admin') {
      query.schoolId = user.schoolId;
    }
    return this.reportModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .exec();
  }
}
