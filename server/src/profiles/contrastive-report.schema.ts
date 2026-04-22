import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, collection: 'contrastivereports' })
export class ContrastiveReport extends Document {
  @Prop({ required: true, index: true })
  speakerId: string;

  @Prop({ index: true })
  teacherId: string;

  @Prop()
  schoolId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'VoiceProfile' })
  profileA: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'VoiceProfile' })
  profileB: string;

  @Prop({ default: 'L1' })
  labelA: string;

  @Prop({ default: 'L2 (English)' })
  labelB: string;

  @Prop({ default: 'bho' })
  l1Language: string;

  @Prop({ default: 'Bhojpuri' })
  l1DisplayName: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  contrastiveData: Record<string, any>;
}

export const ContrastiveReportSchema = SchemaFactory.createForClass(ContrastiveReport);

ContrastiveReportSchema.index({ speakerId: 1, createdAt: -1 });
ContrastiveReportSchema.index({ schoolId: 1, createdAt: -1 });
