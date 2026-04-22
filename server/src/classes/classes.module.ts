import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Classroom, ClassroomSchema } from './class.schema';
import { Student, StudentSchema } from './student.schema';
import { VoiceProfile, VoiceProfileSchema } from '../profiles/voice-profile.schema';
import { ProfilesModule } from '../profiles/profiles.module';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Student.name, schema: StudentSchema },
      { name: VoiceProfile.name, schema: VoiceProfileSchema },
    ]),
    ProfilesModule,
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
