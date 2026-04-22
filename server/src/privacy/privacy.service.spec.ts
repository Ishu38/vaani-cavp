import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { PrivacyService } from './privacy.service';
import { VoiceProfile, VoiceProfileSchema } from '../profiles/voice-profile.schema';
import { ContrastiveReport, ContrastiveReportSchema } from '../profiles/contrastive-report.schema';
import { ConsentRecord, ConsentRecordSchema } from '../consent/consent.schema';
import { AuditService } from '../audit/audit.service';
import { AuditLog, AuditLogSchema } from '../audit/audit.schema';

describe('PrivacyService', () => {
  let service: PrivacyService;
  let module: TestingModule;
  let mongod: MongoMemoryServer;
  let profileModel: Model<VoiceProfile>;
  let reportModel: Model<ContrastiveReport>;
  let consentModel: Model<ConsentRecord>;

  const speakerId = 'speaker_001';
  const schoolId = 'school-001';
  const requestedBy = { userId: 'teacher-001', email: 'teacher@school.edu.in' };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: VoiceProfile.name, schema: VoiceProfileSchema },
          { name: ContrastiveReport.name, schema: ContrastiveReportSchema },
          { name: ConsentRecord.name, schema: ConsentRecordSchema },
          { name: AuditLog.name, schema: AuditLogSchema },
        ]),
      ],
      providers: [PrivacyService, AuditService],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
    profileModel = module.get<Model<VoiceProfile>>(getModelToken(VoiceProfile.name));
    reportModel = module.get<Model<ContrastiveReport>>(getModelToken(ContrastiveReport.name));
    consentModel = module.get<Model<ConsentRecord>>(getModelToken(ConsentRecord.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  it('should delete all student data (profiles, reports, consents)', async () => {
    // Seed data
    await profileModel.create([
      { speakerId, schoolId, teacherId: 'teacher-001', studentName: 'Test Student' },
      { speakerId, schoolId, teacherId: 'teacher-001', studentName: 'Test Student' },
    ]);
    await reportModel.create({
      speakerId,
      schoolId,
      teacherId: 'teacher-001',
    });
    await consentModel.create({
      studentSpeakerId: speakerId,
      schoolId,
      parentEmail: 'parent@example.com',
      parentName: 'Parent',
      requestedBy: 'teacher-001',
    });

    const result = await service.deleteStudentData(speakerId, schoolId, requestedBy);

    expect(result.profiles).toBe(2);
    expect(result.reports).toBe(1);
    expect(result.consents).toBe(1);

    // Verify data is actually deleted
    const remainingProfiles = await profileModel.countDocuments({ speakerId, schoolId });
    const remainingReports = await reportModel.countDocuments({ speakerId, schoolId });
    const remainingConsents = await consentModel.countDocuments({ studentSpeakerId: speakerId, schoolId });

    expect(remainingProfiles).toBe(0);
    expect(remainingReports).toBe(0);
    expect(remainingConsents).toBe(0);
  });

  it('should return retention policy', () => {
    const policy = service.getRetentionPolicy();
    expect(policy.dataRetentionDays).toBe(365);
    expect(policy.audioRetention).toBe('deleted_after_processing');
    expect(policy.profileRetention).toBe('365_days');
  });
});
