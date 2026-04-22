import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { ClassesService, RequestUser } from './classes.service';
import { Classroom, ClassroomSchema } from './class.schema';
import { Student, StudentSchema } from './student.schema';
import { VoiceProfile, VoiceProfileSchema } from '../profiles/voice-profile.schema';

describe('ClassesService', () => {
  let service: ClassesService;
  let module: TestingModule;
  let mongod: MongoMemoryServer;
  let classroomModel: Model<Classroom>;
  let studentModel: Model<Student>;
  let profileModel: Model<VoiceProfile>;

  const teacherId = 'teacher-001';
  const schoolId = 'school-001';
  const adminUser: RequestUser = {
    userId: 'admin-001',
    email: 'admin@school.edu.in',
    role: 'admin',
    school: 'DPS Patna',
    schoolId,
  };
  const teacherUser: RequestUser = {
    userId: teacherId,
    email: 'teacher@school.edu.in',
    role: 'teacher',
    school: 'DPS Patna',
    schoolId,
  };

  let classroomId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Classroom.name, schema: ClassroomSchema },
          { name: Student.name, schema: StudentSchema },
          { name: VoiceProfile.name, schema: VoiceProfileSchema },
        ]),
      ],
      providers: [ClassesService],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
    classroomModel = module.get<Model<Classroom>>(getModelToken(Classroom.name));
    studentModel = module.get<Model<Student>>(getModelToken(Student.name));
    profileModel = module.get<Model<VoiceProfile>>(getModelToken(VoiceProfile.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  it('should create a classroom', async () => {
    const result = await service.createClassroom(
      { name: 'Class 5A', academicYear: '2025-26', grade: '5', section: 'A' },
      teacherId,
      schoolId,
    );
    expect(result.name).toBe('Class 5A');
    expect(result.teacherId).toBe(teacherId);
    expect(result.schoolId).toBe(schoolId);
    classroomId = result.id;
  });

  it("should list teacher's classrooms", async () => {
    const classrooms = await service.getTeacherClassrooms(teacherId);
    expect(classrooms).toHaveLength(1);
    expect(classrooms[0].name).toBe('Class 5A');
  });

  it('should add student to classroom', async () => {
    const student = await service.addStudent(
      classroomId,
      { name: 'Aarav Kumar', speakerId: 'speaker_001' },
      teacherId,
      schoolId,
    );
    expect(student.name).toBe('Aarav Kumar');
    expect(student.speakerId).toBe('speaker_001');
    expect(student.classroomId.toString()).toBe(classroomId);
  });

  it('should get classroom roster', async () => {
    const roster = await service.getClassroomRoster(classroomId, teacherUser);
    expect(roster).toHaveLength(1);
    expect(roster[0].name).toBe('Aarav Kumar');
  });

  it('should return dashboard stats', async () => {
    const stats = await service.getDashboardStats(teacherId, schoolId);
    expect(stats).toHaveProperty('totalStudents');
    expect(stats).toHaveProperty('totalClassrooms');
    expect(stats).toHaveProperty('totalAnalyses');
    expect(stats).toHaveProperty('recentAnalyses');
    expect(stats.totalStudents).toBe(1);
    expect(stats.totalClassrooms).toBe(1);
  });

  it('should compute classroom analytics with trend detection', async () => {
    // Insert two profiles for the student to create a trend
    await profileModel.create({
      speakerId: 'speaker_001',
      schoolId,
      teacherId,
      studentName: 'Aarav Kumar',
      cifAnalysis: { overall_cii: 0.7 },
      phonemeAnalysis: { overall_accuracy: 0.5 },
    });
    await profileModel.create({
      speakerId: 'speaker_001',
      schoolId,
      teacherId,
      studentName: 'Aarav Kumar',
      cifAnalysis: { overall_cii: 0.5 },
      phonemeAnalysis: { overall_accuracy: 0.65 },
    });

    const analytics = await service.getClassroomAnalytics(classroomId, teacherUser);
    expect(analytics).toHaveLength(1);

    const studentAnalytics = analytics[0];
    expect(studentAnalytics.studentName).toBe('Aarav Kumar');
    expect(studentAnalytics.speakerId).toBe('speaker_001');
    expect(studentAnalytics.analysisCount).toBe(2);
    expect(studentAnalytics.latestCifScore).toBeDefined();
    expect(['improving', 'declining', 'stable']).toContain(studentAnalytics.trend);
  });
});
