import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  CHILD = 'child',
}

export enum L1Language {
  BHO = 'bho',
  HIN = 'hin',
  BEN = 'ben',
  ORI = 'ori',
}

@Schema({ timestamps: true, collection: 'students' })
export class Student extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  speakerId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Classroom', index: true })
  classroomId: string;

  @Prop({ index: true })
  teacherId: string;

  @Prop({ index: true })
  schoolId: string;

  @Prop()
  parentEmail: string;

  @Prop()
  parentPhone: string;

  @Prop()
  dateOfBirth: Date;

  @Prop({ type: String, enum: Gender })
  gender: Gender;

  @Prop({ type: String, enum: L1Language, default: L1Language.BHO })
  l1Language: L1Language;

  @Prop({ default: true })
  isActive: boolean;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
