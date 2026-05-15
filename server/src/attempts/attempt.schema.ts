import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * One IELTS / TOEFL Speaking attempt belonging to a signed-in user.
 * Anonymous candidates do not produce Attempt documents — auto-save runs
 * inside the testprep controller only when req.user is present.
 *
 * acoustic.cif is the per-segment CIF table from the engine, kept verbatim so
 * the history detail page can re-render the same acoustic surface the user
 * saw when the attempt was first scored. Predicted-substitution fields are
 * deliberately not persisted (see feedback_vaani_acoustic_only).
 */
@Schema({ timestamps: true, collection: 'attempts' })
export class Attempt extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['ielts', 'toefl'] })
  testType: string;

  // Engine-reported overall band ("6.5", "7.0") — kept as string because IELTS
  // bands and TOEFL section scores aren't the same numeric scale.
  @Prop({ trim: true })
  bandOverall?: string;

  // Per-criterion sub-scores. Free-form so we can extend without schema churn.
  @Prop({ type: Object, default: {} })
  bands?: Record<string, any>;

  // Acoustic block: cif table, prosody, voice quality. Stored as-received.
  @Prop({ type: Object, default: {} })
  acoustic?: Record<string, any>;

  @Prop({ trim: true })
  transcript?: string;

  @Prop({ trim: true })
  promptId?: string;

  @Prop({ trim: true })
  promptText?: string;

  @Prop({ trim: true })
  l1Language?: string;

  // Coach feedback rendered for the report. May be summary text or structured.
  @Prop({ type: Object, default: {} })
  feedback?: Record<string, any>;
}

export const AttemptSchema = SchemaFactory.createForClass(Attempt);
AttemptSchema.index({ userId: 1, createdAt: -1 });
