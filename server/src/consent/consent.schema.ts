import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ConsentType {
  AUDIO_RECORDING = 'audio_recording',
  VOICE_ANALYSIS = 'voice_analysis',
  DATA_STORAGE = 'data_storage',
  REPORT_SHARING = 'report_sharing',
}

@Schema({ timestamps: true, collection: 'consentrecords' })
export class ConsentRecord extends Document {
  @Prop({ required: true, index: true })
  studentSpeakerId: string;

  @Prop({ required: true })
  parentEmail: string;

  @Prop({ required: true })
  parentName: string;

  @Prop({ type: [String], enum: ConsentType, default: Object.values(ConsentType) })
  consentTypes: ConsentType[];

  @Prop({ default: false })
  granted: boolean;

  @Prop()
  grantedAt: Date;

  @Prop()
  revokedAt: Date;

  @Prop()
  ipAddress: string;

  @Prop()
  userAgent: string;

  @Prop({ default: '1.0' })
  consentVersion: string;

  @Prop({ index: true })
  schoolId: string;

  @Prop()
  requestedBy: string;
}

export const ConsentRecordSchema = SchemaFactory.createForClass(ConsentRecord);

ConsentRecordSchema.index({ studentSpeakerId: 1, schoolId: 1 });
