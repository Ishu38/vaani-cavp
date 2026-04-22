import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, Tier, TIER_LIMITS } from './subscription.schema';
import { UsageRecord } from './usage.schema';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Subscription.name) private subModel: Model<Subscription>,
    @InjectModel(UsageRecord.name) private usageModel: Model<UsageRecord>,
  ) {}

  /** Get current month key: "2026-03" */
  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Get a school's active subscription (falls back to FREE). */
  async getSubscription(schoolId: string): Promise<{ tier: Tier; expiresAt: Date | null }> {
    const sub = await this.subModel
      .findOne({ schoolId, isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    if (!sub || sub.tier === Tier.FREE) {
      return { tier: Tier.FREE, expiresAt: null };
    }

    // Check expiry
    if (sub.expiresAt && sub.expiresAt < new Date()) {
      return { tier: Tier.FREE, expiresAt: null };
    }

    return { tier: sub.tier, expiresAt: sub.expiresAt };
  }

  /** Get current month's usage count for a school. */
  async getUsage(schoolId: string): Promise<number> {
    const record = await this.usageModel
      .findOne({ schoolId, month: this.currentMonth() })
      .exec();
    return record?.analysisCount ?? 0;
  }

  /** Check if school can run another analysis. Throws ForbiddenException if over quota. */
  async checkQuota(schoolId: string): Promise<void> {
    const { tier } = await this.getSubscription(schoolId);
    const limit = TIER_LIMITS[tier];

    // -1 = unlimited
    if (limit === -1) return;

    const used = await this.getUsage(schoolId);
    if (used >= limit) {
      throw new ForbiddenException(
        `Monthly analysis limit reached (${used}/${limit} on ${tier} plan). Upgrade to continue.`,
      );
    }
  }

  /** Increment usage counter after a successful analysis submission. */
  async incrementUsage(schoolId: string): Promise<number> {
    const month = this.currentMonth();
    const record = await this.usageModel.findOneAndUpdate(
      { schoolId, month },
      { $inc: { analysisCount: 1 } },
      { upsert: true, new: true },
    ).exec();
    return record.analysisCount;
  }

  /** Get subscription status + usage for display. */
  async getStatus(schoolId: string) {
    const { tier, expiresAt } = await this.getSubscription(schoolId);
    const limit = TIER_LIMITS[tier];
    const used = await this.getUsage(schoolId);

    return {
      tier,
      expiresAt,
      monthlyLimit: limit === -1 ? 'unlimited' : limit,
      used,
      remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - used),
    };
  }

  // ── Admin operations (after verifying UPI payment) ──

  async activatePlan(
    schoolId: string,
    tier: Tier,
    durationDays: number,
    adminUserId: string,
    upiTransactionId: string,
    notes?: string,
  ): Promise<Subscription> {
    // Deactivate previous subscriptions for this school
    await this.subModel.updateMany(
      { schoolId, isActive: true },
      { isActive: false },
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    return this.subModel.create({
      schoolId,
      tier,
      activatedAt: now,
      expiresAt,
      upiTransactionId,
      activatedBy: adminUserId,
      isActive: true,
      notes: notes || '',
    });
  }

  async deactivatePlan(schoolId: string): Promise<void> {
    await this.subModel.updateMany(
      { schoolId, isActive: true },
      { isActive: false },
    );
  }

  async listActiveSubscriptions(): Promise<Subscription[]> {
    return this.subModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .exec();
  }
}
