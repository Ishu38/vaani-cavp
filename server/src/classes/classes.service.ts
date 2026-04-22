import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Classroom } from './class.schema';
import { Student } from './student.schema';
import { VoiceProfile } from '../profiles/voice-profile.schema';
import { CreateClassroomDto, UpdateClassroomDto, CreateStudentDto, UpdateStudentDto } from './classes.dto';

export interface RequestUser {
  userId: string;
  email: string;
  role: string;
  school: string;
  schoolId: string;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectModel(Classroom.name) private classroomModel: Model<Classroom>,
    @InjectModel(Student.name) private studentModel: Model<Student>,
    @InjectModel(VoiceProfile.name) private profileModel: Model<VoiceProfile>,
  ) {}

  private assertSchoolAccess(user: RequestUser, schoolId: string): void {
    if (user.role === 'admin') return;
    if (!schoolId || user.schoolId !== schoolId) {
      throw new ForbiddenException('Access denied: you can only access data from your own school');
    }
  }

  // ── Classrooms ──

  async createClassroom(
    dto: CreateClassroomDto,
    teacherId: string,
    schoolId: string,
  ): Promise<Classroom> {
    return this.classroomModel.create({
      name: dto.name,
      teacherId,
      schoolId,
      academicYear: dto.academicYear,
      grade: dto.grade,
      section: dto.section,
    });
  }

  async getTeacherClassrooms(teacherId: string): Promise<Classroom[]> {
    return this.classroomModel
      .find({ teacherId, isActive: true })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getSchoolClassrooms(schoolId: string): Promise<Classroom[]> {
    return this.classroomModel
      .find({ schoolId, isActive: true })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getClassroomById(id: string, user: RequestUser): Promise<Classroom> {
    const classroom = await this.classroomModel.findById(id).exec();
    if (!classroom) throw new NotFoundException('Classroom not found');
    this.assertSchoolAccess(user, classroom.schoolId);
    return classroom;
  }

  async updateClassroom(
    id: string,
    dto: UpdateClassroomDto,
    user: RequestUser,
  ): Promise<Classroom> {
    const classroom = await this.classroomModel.findById(id).exec();
    if (!classroom) throw new NotFoundException('Classroom not found');
    this.assertSchoolAccess(user, classroom.schoolId);

    const updated = await this.classroomModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    return updated!;
  }

  async deleteClassroom(id: string, user: RequestUser): Promise<Classroom> {
    const classroom = await this.classroomModel.findById(id).exec();
    if (!classroom) throw new NotFoundException('Classroom not found');
    this.assertSchoolAccess(user, classroom.schoolId);

    const updated = await this.classroomModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
    return updated!;
  }

  // ── Students ──

  async addStudent(
    classroomId: string,
    dto: CreateStudentDto,
    teacherId: string,
    schoolId: string,
  ): Promise<Student> {
    return this.studentModel.create({
      name: dto.name,
      speakerId: dto.speakerId,
      classroomId,
      teacherId,
      schoolId,
      parentEmail: dto.parentEmail,
      parentPhone: dto.parentPhone,
      dateOfBirth: dto.dateOfBirth,
      gender: dto.gender,
      l1Language: dto.l1Language,
    });
  }

  async removeStudent(studentId: string, user: RequestUser): Promise<Student> {
    const student = await this.studentModel.findById(studentId).exec();
    if (!student) throw new NotFoundException('Student not found');
    this.assertSchoolAccess(user, student.schoolId);

    const updated = await this.studentModel
      .findByIdAndUpdate(studentId, { isActive: false }, { new: true })
      .exec();
    return updated!;
  }

  async getClassroomRoster(classroomId: string, user: RequestUser): Promise<Student[]> {
    const classroom = await this.classroomModel.findById(classroomId).exec();
    if (!classroom) throw new NotFoundException('Classroom not found');
    this.assertSchoolAccess(user, classroom.schoolId);

    return this.studentModel
      .find({ classroomId, isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  async getStudentBySpeakerId(speakerId: string, schoolId: string): Promise<Student | null> {
    return this.studentModel.findOne({ speakerId, schoolId }).exec();
  }

  // ── Dashboard & Analytics ──

  async getDashboardStats(teacherId: string, schoolId: string) {
    const [totalStudents, totalClassrooms, totalAnalyses, recentProfiles] = await Promise.all([
      this.studentModel.countDocuments({ schoolId, isActive: true }).exec(),
      this.classroomModel.countDocuments({ teacherId, isActive: true }).exec(),
      this.profileModel.countDocuments({ schoolId }).exec(),
      this.profileModel
        .find({ schoolId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select({
          speakerId: 1,
          studentName: 1,
          'cifAnalysis.overall_cii': 1,
          createdAt: 1,
        })
        .exec(),
    ]);

    const recentAnalyses = recentProfiles.map((p) => ({
      speakerId: p.speakerId,
      studentName: p.studentName,
      cifScore: p.cifAnalysis?.overall_cii ?? null,
      date: (p as any).createdAt,
    }));

    return {
      totalStudents,
      totalClassrooms,
      totalAnalyses,
      recentAnalyses,
    };
  }

  async getClassroomAnalytics(
    classroomId: string,
    user: RequestUser,
    page = 1,
    limit = 30,
  ) {
    const classroom = await this.classroomModel.findById(classroomId).exec();
    if (!classroom) throw new NotFoundException('Classroom not found');
    this.assertSchoolAccess(user, classroom.schoolId);

    const skip = (page - 1) * limit;

    const [students, totalStudents] = await Promise.all([
      this.studentModel
        .find({ classroomId, isActive: true })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.studentModel.countDocuments({ classroomId, isActive: true }).exec(),
    ]);

    if (students.length === 0) {
      return { data: [], page, limit, total: totalStudents };
    }

    const speakerIds = students.map((s) => s.speakerId);

    // Single aggregation: get latest 2 profiles + count per speaker (replaces N+1 queries)
    const profileAgg = await this.profileModel.aggregate([
      { $match: { speakerId: { $in: speakerIds }, schoolId: classroom.schoolId } },
      { $sort: { createdAt: -1 as const } },
      {
        $group: {
          _id: '$speakerId',
          count: { $sum: 1 },
          latest: { $first: '$$ROOT' },
          previous: {
            $accumulator: {
              init: function () { return []; },
              accumulate: function (state: any[], doc: any) { if (state.length < 2) state.push(doc); return state; },
              accumulateArgs: ['$$ROOT'],
              merge: function (a: any[], b: any[]) { return a.concat(b).slice(0, 2); },
              finalize: function (state: any[]) { return state[1] || null; },
              lang: 'js',
            },
          },
        },
      },
    ]);

    const profileMap = new Map(
      profileAgg.map((p) => [p._id, p]),
    );

    const data = students.map((student) => {
      const agg = profileMap.get(student.speakerId);
      const latest = agg?.latest;
      const previous = agg?.previous;

      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (latest && previous) {
        const latestCif = latest.cifAnalysis?.overall_cii;
        const prevCif = previous.cifAnalysis?.overall_cii;
        if (latestCif != null && prevCif != null) {
          if (latestCif > prevCif) trend = 'improving';
          else if (latestCif < prevCif) trend = 'declining';
        }
      }

      return {
        studentName: student.name,
        speakerId: student.speakerId,
        latestCifScore: latest?.cifAnalysis?.overall_cii ?? null,
        latestAccuracy: latest?.phonemeAnalysis?.overall_accuracy ?? null,
        analysisCount: agg?.count ?? 0,
        lastAnalysisDate: latest?.createdAt ?? null,
        trend,
      };
    });

    return { data, page, limit, total: totalStudents };
  }
}
