import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Plan, User } from './user.schema';

// Canonical native-language strings accepted at the gateway. Production
// scope is the empirically-calibrated L1 set only — Bengali + Hindi. Any
// other typed value is rejected outright so the user is forced onto a
// substrate the engine has actually fitted. Other patterns (Bhojpuri,
// Odia, Tamil, Telugu) live in the engine code for future calibration
// but are deliberately not surfaced here.
const NATIVE_LANGUAGE_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /^(bangla|bengali|bn)\b/, canonical: 'Bengali' },
  { pattern: /^(hindi|hi)\b/,          canonical: 'Hindi' },
];
const NATIVE_LANGUAGE_ALLOWED = NATIVE_LANGUAGE_PATTERNS.map((p) => p.canonical).join(', ');

function normalizeNativeLanguage(raw: string): string {
  const norm = raw.trim().toLowerCase();
  for (const { pattern, canonical } of NATIVE_LANGUAGE_PATTERNS) {
    if (pattern.test(norm)) return canonical;
  }
  throw new BadRequestException(
    `Unrecognised native language "${raw}". Allowed values: ${NATIVE_LANGUAGE_ALLOWED}.`,
  );
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    school?: string;
    schoolId?: string;
    providers?: string[];
    emailVerified?: boolean;
  }): Promise<User> {
    const hashed = await bcrypt.hash(data.password, 12);
    return this.userModel.create({
      ...data,
      password: hashed,
      providers: data.providers ?? ['password'],
    });
  }

  async markEmailVerifiedById(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { emailVerified: true },
    ).exec();
  }

  async addProvider(userId: string, provider: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { providers: provider } },
    ).exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  /** Resolve a user's effective subscription tier *right now*. If the stored
   *  plan is `test_cycle` or `pro` and `planExpiresAt` has passed, the user
   *  is silently treated as `free` for quota / feature checks (we don't
   *  rewrite the document — a renewal payment can extend `planExpiresAt`
   *  without re-creating the plan record).
   */
  async getEffectivePlan(userId: string): Promise<{ plan: Plan; expired: boolean; expiresAt: Date | null }> {
    const user = await this.userModel
      .findById(userId)
      .select('plan planExpiresAt')
      .lean()
      .exec();
    const stored = (user?.plan as Plan) || Plan.FREE;
    const expiresAt = user?.planExpiresAt ? new Date(user.planExpiresAt) : null;
    const isTimeBound = stored === Plan.TEST_CYCLE || stored === Plan.PRO;
    const expired = isTimeBound && (!expiresAt || expiresAt.getTime() < Date.now());
    const effective = expired ? Plan.FREE : stored;
    return { plan: effective, expired, expiresAt };
  }

  async findBySchool(schoolId: string): Promise<User[]> {
    return this.userModel.find({ schoolId, isActive: true }).exec();
  }

  async updateRole(userId: string, role: string): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(userId, { role }, { new: true }).exec();
  }

  async deactivate(userId: string): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(userId, { isActive: false }, { new: true }).exec();
  }

  /** Update candidate profile fields. Only writes the keys that are present
   *  + non-empty in `data` so a partial PATCH doesn't blank out other fields. */
  async updateCandidateProfile(
    userId: string,
    data: {
      name?: string;
      age?: string;
      ielts_centre_name?: string;
      registration_number?: string;
      phone?: string;
      dob?: string;
      nativeLanguage?: string;
      preparingFor?: string;
      targetBand?: string;
      address?: {
        line1?: string;
        city?: string;
        state?: string;
        country?: string;
        pincode?: string;
      };
    },
  ): Promise<User | null> {
    const update: Record<string, any> = {};
    const stringKeys = [
      'name',
      'age',
      'ielts_centre_name',
      'registration_number',
      'phone',
      'dob',
      'nativeLanguage',
      'preparingFor',
      'targetBand',
    ] as const;
    for (const k of stringKeys) {
      const v = data[k];
      if (typeof v === 'string' && v.trim()) {
        update[k] = k === 'nativeLanguage' ? normalizeNativeLanguage(v) : v.trim();
      }
    }
    if (data.address && typeof data.address === 'object') {
      const addr: Record<string, string> = {};
      for (const k of ['line1', 'city', 'state', 'country', 'pincode'] as const) {
        const v = data.address[k];
        if (typeof v === 'string' && v.trim()) addr[k] = v.trim();
      }
      // Use dotted paths so we don't blow away unspecified address subfields.
      for (const [k, v] of Object.entries(addr)) update[`address.${k}`] = v;
    }
    if (Object.keys(update).length === 0) {
      return this.userModel.findById(userId).exec();
    }
    return this.userModel.findByIdAndUpdate(userId, update, { new: true }).exec();
  }

  /** Persist the avatar URL after a successful R2 upload. Separate from the
   *  general profile patch because the URL is server-derived, not user-typed. */
  async setAvatarUrl(userId: string, avatarUrl: string): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(userId, { avatarUrl }, { new: true }).exec();
  }

  // ── Email verification + password reset + Google link ──────────────────
  // Tokens are persisted as bcrypt hashes; the plain raw goes in the email
  // link. compareToken() walks the +select hashed fields to verify a raw
  // claim. Expiries are enforced in the auth service before any state change.

  async setEmailVerificationToken(userId: string, hashed: string, expiresAt: Date): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { emailVerificationToken: hashed, emailVerificationExpiresAt: expiresAt },
    ).exec();
  }

  async findByVerificationCandidate(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+emailVerificationToken')
      .exec();
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        emailVerified: true,
        $unset: { emailVerificationToken: '', emailVerificationExpiresAt: '' },
      },
    ).exec();
  }

  async setPasswordResetToken(userId: string, hashed: string, expiresAt: Date): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { passwordResetToken: hashed, passwordResetExpiresAt: expiresAt },
    ).exec();
  }

  async findByResetCandidate(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordResetToken +password')
      .exec();
  }

  async resetPassword(userId: string, newHashedPassword: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        password: newHashedPassword,
        $unset: { passwordResetToken: '', passwordResetExpiresAt: '' },
      },
    ).exec();
  }

  async setGoogleLinkToken(userId: string, hashed: string, expiresAt: Date): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { googleLinkToken: hashed, googleLinkExpiresAt: expiresAt },
    ).exec();
  }

  async findByGoogleLinkCandidate(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+googleLinkToken')
      .exec();
  }

  async clearGoogleLinkToken(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $unset: { googleLinkToken: '', googleLinkExpiresAt: '' } },
    ).exec();
  }
}
