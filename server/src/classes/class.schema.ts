import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'classrooms' })
export class Classroom extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ index: true })
  teacherId: string;

  @Prop({ index: true })
  schoolId: string;

  @Prop()
  academicYear: string;

  @Prop()
  grade: string;

  @Prop()
  section: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const ClassroomSchema = SchemaFactory.createForClass(Classroom);
