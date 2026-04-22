import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, collection: 'voiceprofiles' })
export class VoiceProfile extends Document {
  @Prop({ required: true, index: true })
  speakerId: string;

  @Prop({ index: true })
  teacherId: string;

  @Prop()
  schoolId: string;

  @Prop()
  studentName: string;

  @Prop()
  sessionId: string;

  @Prop()
  audioFilename: string;

  @Prop({ default: 'en' })
  language: string;

  @Prop({ default: 'neutral' })
  gender: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  transcription: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  featureExtraction: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  aiClassification: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  nlp: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  phonemeAnalysis: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  morphemeBoundary: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  prosodicProfile: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  connectedSpeech: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  voiceQuality: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  l1Interference: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  bhojpuriInterference: Record<string, any>;  // backwards compat

  @Prop({ default: 'bho' })
  l1Language: string;

  @Prop({ default: 'Bhojpuri' })
  l1DisplayName: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  cifAnalysis: Record<string, any>;

  @Prop()
  processingTimeMs: number;
}

export const VoiceProfileSchema = SchemaFactory.createForClass(VoiceProfile);

// Compound indexes for efficient queries
VoiceProfileSchema.index({ speakerId: 1, createdAt: -1 });
VoiceProfileSchema.index({ teacherId: 1, createdAt: -1 });
VoiceProfileSchema.index({ schoolId: 1, createdAt: -1 });
