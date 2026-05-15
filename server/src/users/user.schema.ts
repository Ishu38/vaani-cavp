import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum Role {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  STUDENT = 'student',
}

// Pricing tiers — must stay in sync with client/src/pages/PricingPage.jsx PRICING_TIERS.
// `free` is the default; `test_cycle` / `pro` are time-bound (planExpiresAt set
// when the manual UPI invoice is marked paid, or by the Razorpay webhook once
// KYC clears); `centre` is admin-set for institutional accounts.
export enum Plan {
  FREE = 'free',
  TEST_CYCLE = 'test_cycle',
  PRO = 'pro',
  CENTRE = 'centre',
}

@Schema({ _id: false })
export class Address {
  @Prop({ trim: true }) line1?: string;
  @Prop({ trim: true }) city?: string;
  @Prop({ trim: true }) state?: string;
  @Prop({ trim: true, default: 'India' }) country?: string;
  @Prop({ trim: true }) pincode?: string;
}
const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: String, enum: Role, default: Role.TEACHER })
  role: Role;

  @Prop({ trim: true })
  school: string;

  @Prop({ trim: true })
  schoolId: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: ['password'] })
  providers: string[];

  // Subscription tier. Drives free-vs-paid feature gates (PDF reports, monthly
  // analyze quota). `planExpiresAt` is null for `free` and `centre`; for
  // `test_cycle` / `pro` it's the date after which the user falls back to
  // free-tier limits if not renewed.
  @Prop({ type: String, enum: Plan, default: Plan.FREE })
  plan?: Plan;

  @Prop({ type: Date })
  planExpiresAt?: Date;

  // Candidate profile fields. Populated lazily — first IELTS report saves
  // what the candidate types into the form; every subsequent report
  // pre-fills from these so users don't re-enter the same info each time.
  @Prop({ trim: true })
  age?: string;

  @Prop({ trim: true })
  ielts_centre_name?: string;

  @Prop({ trim: true })
  registration_number?: string;

  // Profile surface (v1 account page).
  @Prop({ trim: true })
  avatarUrl?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: AddressSchema, default: () => ({}) })
  address?: Address;

  // ISO date string YYYY-MM-DD; kept as string for timezone-free storage.
  @Prop({ trim: true })
  dob?: string;

  // L1 / mother tongue. Free-text; CAVP also runs auto-detect, this is the
  // candidate's own declaration and is shown back on the report.
  @Prop({ trim: true })
  nativeLanguage?: string;

  // 'ielts' | 'toefl' — drives default test type on the practice page.
  @Prop({ trim: true })
  preparingFor?: string;

  // 6.0 / 7.5 etc. — kept as string to allow ".5" without float quirks.
  @Prop({ trim: true })
  targetBand?: string;

  // Email verification. Tokens are stored hashed (bcrypt) so a DB read
  // doesn't leak a working verification link. expiresAt enforces the link's
  // 24h lifetime; after that the user must request a fresh email.
  @Prop({ default: false })
  emailVerified?: boolean;

  @Prop({ select: false })
  emailVerificationToken?: string;

  @Prop()
  emailVerificationExpiresAt?: Date;

  // Password reset. Same hashed-token + expiry pattern. Reset links are good
  // for 1h — short window because reset emails are higher-risk than verify.
  @Prop({ select: false })
  passwordResetToken?: string;

  @Prop()
  passwordResetExpiresAt?: Date;

  // Google-link confirmation. When Google sign-in arrives for an email that
  // already exists as a password account, we send a confirmation link to the
  // existing email; clicking it adds 'google' to providers without giving
  // away the account on a 401.
  @Prop({ select: false })
  googleLinkToken?: string;

  @Prop()
  googleLinkExpiresAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
