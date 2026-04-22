import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { ConsentService } from './consent.service';
import { ConsentRecord, ConsentRecordSchema } from './consent.schema';

describe('ConsentService', () => {
  let service: ConsentService;
  let module: TestingModule;
  let mongod: MongoMemoryServer;
  let consentModel: Model<ConsentRecord>;

  const teacherId = 'teacher-001';
  const schoolId = 'school-001';
  const speakerId = 'speaker_001';

  let consentRecordId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: ConsentRecord.name, schema: ConsentRecordSchema },
        ]),
      ],
      providers: [ConsentService],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
    consentModel = module.get<Model<ConsentRecord>>(getModelToken(ConsentRecord.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await consentModel.deleteMany({});
  });

  it('should create consent request (granted=false)', async () => {
    const result = await service.requestConsent(
      {
        studentSpeakerId: speakerId,
        parentEmail: 'parent@example.com',
        parentName: 'Rajesh Kumar',
      },
      teacherId,
      schoolId,
    );
    expect(result.granted).toBe(false);
    expect(result.studentSpeakerId).toBe(speakerId);
    expect(result.parentEmail).toBe('parent@example.com');
    expect(result.parentName).toBe('Rajesh Kumar');
    consentRecordId = result.id;
  });

  it('should verify consent (granted=true)', async () => {
    const created = await service.requestConsent(
      {
        studentSpeakerId: speakerId,
        parentEmail: 'parent@example.com',
        parentName: 'Rajesh Kumar',
      },
      teacherId,
      schoolId,
    );
    const verified = await service.verifyConsent(created.id);
    expect(verified.granted).toBe(true);
    expect(verified.grantedAt).toBeDefined();
  });

  it('should revoke consent', async () => {
    const created = await service.requestConsent(
      {
        studentSpeakerId: speakerId,
        parentEmail: 'parent@example.com',
        parentName: 'Rajesh Kumar',
      },
      teacherId,
      schoolId,
    );
    await service.verifyConsent(created.id);

    await service.revokeConsent(speakerId, schoolId);

    const records = await service.getConsentStatus(speakerId, schoolId);
    expect(records[0].granted).toBe(false);
    expect(records[0].revokedAt).toBeDefined();
  });

  it('isAnalysisAllowed should return true when no records exist', async () => {
    const allowed = await service.isAnalysisAllowed('nonexistent_speaker', schoolId);
    expect(allowed).toBe(true);
  });

  it('isAnalysisAllowed should return true when granted consent exists', async () => {
    const created = await service.requestConsent(
      {
        studentSpeakerId: speakerId,
        parentEmail: 'parent@example.com',
        parentName: 'Rajesh Kumar',
      },
      teacherId,
      schoolId,
    );
    await service.verifyConsent(created.id);

    const allowed = await service.isAnalysisAllowed(speakerId, schoolId);
    expect(allowed).toBe(true);
  });

  it('isAnalysisAllowed should return false when all consents revoked', async () => {
    await service.requestConsent(
      {
        studentSpeakerId: speakerId,
        parentEmail: 'parent@example.com',
        parentName: 'Rajesh Kumar',
      },
      teacherId,
      schoolId,
    );
    await service.revokeConsent(speakerId, schoolId);

    const allowed = await service.isAnalysisAllowed(speakerId, schoolId);
    expect(allowed).toBe(false);
  });
});
