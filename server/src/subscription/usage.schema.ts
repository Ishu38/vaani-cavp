import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Monthly usage counter per school.
 * One document per school per month (keyed by "YYYY-MM").
 */
@Schema({ timestamps: true })
export class UsageRecord extends Document {
  @Prop({ required: true, index: true })
  schoolId: string;

  /** Format: "2026-03" */
  @Prop({ required: true })
  month: string;

  @Prop({ default: 0 })
  analysisCount: number;
}

export const UsageRecordSchema = SchemaFactory.createForClass(UsageRecord);

// Compound index: one document per school per month
UsageRecordSchema.index({ schoolId: 1, month: 1 }, { unique: true });
