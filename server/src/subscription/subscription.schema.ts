import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum Tier {
  FREE = 'free',
  SCHOOL_PRO = 'school_pro',
  DISTRICT = 'district',
  ENTERPRISE = 'enterprise',
}

/** Per-tier monthly analysis limits. -1 means unlimited. */
export const TIER_LIMITS: Record<Tier, number> = {
  [Tier.FREE]: 3,
  [Tier.SCHOOL_PRO]: -1,
  [Tier.DISTRICT]: -1,
  [Tier.ENTERPRISE]: -1,
};

@Schema({ timestamps: true })
export class Subscription extends Document {
  @Prop({ required: true, index: true })
  schoolId: string;

  @Prop({ type: String, enum: Tier, default: Tier.FREE })
  tier: Tier;

  @Prop({ type: Date })
  activatedAt: Date;

  @Prop({ type: Date })
  expiresAt: Date;

  @Prop({ trim: true })
  upiTransactionId: string;

  @Prop({ trim: true })
  activatedBy: string; // admin userId who activated

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ trim: true })
  notes: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
