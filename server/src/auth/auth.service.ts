import { Injectable, UnauthorizedException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private _googleClient: OAuth2Client | null = null;

  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private email: EmailService,
  ) {}

  private get googleClient(): OAuth2Client {
    if (!this._googleClient) {
      this._googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID || undefined);
    }
    return this._googleClient;
  }

  async loginWithGoogle(credential: string) {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new BadRequestException('Google sign-in is not configured on this server');
    }
    if (!credential || typeof credential !== 'string') {
      throw new BadRequestException('credential is required');
    }

    let payload: any;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (e) {
      this.logger.warn(`Google token verification failed: ${(e as Error).message}`);
      throw new UnauthorizedException('Google sign-in verification failed');
    }
    if (!payload?.email) {
      throw new UnauthorizedException('Google account has no email');
    }
    if (payload.email_verified === false) {
      throw new UnauthorizedException('Google email is not verified');
    }

    const email = String(payload.email).toLowerCase();
    const name = payload.name || payload.given_name || email.split('@')[0];

    let user = await this.users.findByEmail(email);
    if (!user) {
      // Generate a random unusable password — this user authenticates via Google only.
      // emailVerified=true on creation: Google has already verified the email
      // address as part of the OAuth flow, so a separate verification email
      // would be redundant and confusing.
      const filler = crypto.randomBytes(32).toString('hex');
      user = await this.users.create({
        name: String(name).slice(0, 200),
        email,
        password: filler,
        role: 'student',
        providers: ['google'],
        emailVerified: true,
      });
      const created = user;
      this.email.sendWelcome(created.email, created.name).catch((err) =>
        this.logger.warn(`welcome email (google) failed for ${created.email}: ${err?.message || err}`),
      );
    } else {
      // Existing account — refuse if it wasn't created via Google.
      // Prevents takeover where someone signs up via password under a victim's
      // email, then receives a Google-issued JWT for the same account.
      // Legacy users (no providers field at all) are migrated on first Google login.
      const providers = (user.providers as string[] | undefined);
      if (!providers || providers.length === 0) {
        await this.users.addProvider(user.id, 'google');
        // Returning legacy user without providers — back-fill verified state.
        if (!(user as any).emailVerified) {
          await this.users.markEmailVerifiedById(user.id);
        }
      } else if (providers.includes('google')) {
        // Existing Google-linked user — back-fill verified state if it's
        // missing (covers users who signed up before this fix shipped).
        if (!(user as any).emailVerified) {
          await this.users.markEmailVerifiedById(user.id);
        }
      } else if (!providers.includes('google')) {
        // Auth-linking flow: send the existing email a confirmation link.
        // Clicking it adds 'google' to providers — proves the user controls
        // both the original account email and the Google account claiming
        // it. Surface a user-readable hint to the SPA via 409 + structured
        // body, so the modal can render a "we sent you an email" notice.
        const linkUser = user;
        const { raw, hashed } = this.generateToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await this.users.setGoogleLinkToken(linkUser.id, await hashed, expiresAt);
        const link = `${this.webBase()}/link-google?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(linkUser.email)}`;
        this.email.sendGoogleLinkConfirmation(linkUser.email, linkUser.name, link).catch((err) =>
          this.logger.warn(`google-link email failed for ${linkUser.email}: ${err?.message || err}`),
        );
        throw new ConflictException({
          message: 'Account with this email exists under a different sign-in method. We emailed you a link to add Google sign-in.',
          code: 'account_link_required',
          email: linkUser.email,
        });
      }
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    const token = this.signToken(user.id, user.role);
    return {
      access_token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        school: user.school,
        provider: 'google',
      },
    };
  }

  async signup(dto: SignupDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = await this.users.create(dto);
    const token = this.signToken(user.id, user.role);

    // Fire-and-forget welcome email; never block signup on transport failure.
    this.email.sendWelcome(user.email, user.name).catch((err) =>
      this.logger.warn(`welcome email send failed for ${user.email}: ${err?.message || err}`),
    );
    // Also kick off email verification — user can record without verifying,
    // but the SPA shows a banner until they click the link. Send is async
    // (state write + email POST happen sequentially but off the request path).
    this.sendVerificationEmail(user.id).catch((err) =>
      this.logger.warn(`verification email kickoff failed for ${user.email}: ${err?.message || err}`),
    );

    return {
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, school: user.school },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    const token = this.signToken(user.id, user.role);

    return {
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, school: user.school },
    };
  }

  private serializeUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: !!user.emailVerified,
      role: user.role,
      school: user.school,
      avatarUrl: user.avatarUrl,
      // Candidate profile fields — undefined for first-time users; the SPA's
      // IELTSReportForm pre-fills from these when present.
      age: user.age,
      ielts_centre_name: user.ielts_centre_name,
      registration_number: user.registration_number,
      phone: user.phone,
      address: user.address || {},
      dob: user.dob,
      nativeLanguage: user.nativeLanguage,
      preparingFor: user.preparingFor,
      targetBand: user.targetBand,
    };
  }

  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.serializeUser(user);
  }

  /** PATCH /api/auth/profile — update candidate-side profile fields without
   *  touching auth-sensitive state (password, providers, isActive, role). */
  async updateCandidateProfile(
    userId: string,
    body: Parameters<UsersService['updateCandidateProfile']>[1],
  ) {
    const updated = await this.users.updateCandidateProfile(userId, body);
    if (!updated) throw new UnauthorizedException();
    return this.serializeUser(updated);
  }

  /** Called by the avatar-upload endpoint after a successful R2 put. */
  async setAvatarUrl(userId: string, avatarUrl: string) {
    const updated = await this.users.setAvatarUrl(userId, avatarUrl);
    if (!updated) throw new UnauthorizedException();
    return this.serializeUser(updated);
  }

  // ── Verification + reset + Google link ─────────────────────────────────
  // Helpers: produce a 32-byte url-safe random token, hash it with bcrypt
  // before persisting (so the DB never holds a working link). The plain
  // token is the only secret carried in the email URL; once it's spent we
  // unset the hash on the user.

  private generateToken(): { raw: string; hashed: Promise<string> } {
    const raw = crypto.randomBytes(32).toString('base64url');
    return { raw, hashed: bcrypt.hash(raw, 10) };
  }

  private webBase(): string {
    // Default matches the deployed SPA. Override via WEB_BASE for staging.
    return (process.env.WEB_BASE || 'https://app.vaaani.in').replace(/\/+$/, '');
  }

  /** Generate + persist + email a verification token. Idempotent — re-sending
   *  rotates the token so any older links stop working. */
  async sendVerificationEmail(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    if ((user as any).emailVerified) return { status: 'ok', alreadyVerified: true };
    const { raw, hashed } = this.generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.users.setEmailVerificationToken(user.id, await hashed, expiresAt);
    const link = `${this.webBase()}/verify-email?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(user.email)}`;
    this.email.sendVerificationEmail(user.email, user.name, link).catch((err) =>
      this.logger.warn(`verification email failed for ${user.email}: ${err?.message || err}`),
    );
    return { status: 'ok' };
  }

  async confirmEmail(email: string, token: string) {
    if (!email || !token) throw new BadRequestException('email and token required');
    const user = await this.users.findByVerificationCandidate(email);
    if (!user || !(user as any).emailVerificationToken) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }
    const expiresAt = (user as any).emailVerificationExpiresAt as Date | undefined;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Verification link has expired — please request a new one');
    }
    const ok = await bcrypt.compare(token, (user as any).emailVerificationToken);
    if (!ok) throw new UnauthorizedException('Invalid or expired verification link');
    await this.users.markEmailVerified(user.id);
    return { status: 'ok', email: user.email };
  }

  async requestPasswordReset(email: string) {
    // Always return ok — never leak whether an email exists. Internally we
    // skip the email send + token write if no user found.
    if (email) {
      const user = await this.users.findByEmail(email);
      if (user) {
        const { raw, hashed } = this.generateToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
        await this.users.setPasswordResetToken(user.id, await hashed, expiresAt);
        const link = `${this.webBase()}/reset-password?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(user.email)}`;
        this.email.sendPasswordReset(user.email, user.name, link).catch((err) =>
          this.logger.warn(`reset email failed for ${user.email}: ${err?.message || err}`),
        );
      }
    }
    return { status: 'ok' };
  }

  async confirmPasswordReset(email: string, token: string, newPassword: string) {
    if (!email || !token || !newPassword) {
      throw new BadRequestException('email, token, and newPassword required');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const user = await this.users.findByResetCandidate(email);
    if (!user || !(user as any).passwordResetToken) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }
    const expiresAt = (user as any).passwordResetExpiresAt as Date | undefined;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Reset link has expired — please request a new one');
    }
    const ok = await bcrypt.compare(token, (user as any).passwordResetToken);
    if (!ok) throw new UnauthorizedException('Invalid or expired reset link');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.users.resetPassword(user.id, hashed);
    return { status: 'ok' };
  }

  async confirmGoogleLink(email: string, token: string) {
    if (!email || !token) throw new BadRequestException('email and token required');
    const user = await this.users.findByGoogleLinkCandidate(email);
    if (!user || !(user as any).googleLinkToken) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    const expiresAt = (user as any).googleLinkExpiresAt as Date | undefined;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Link has expired — try Google sign-in again');
    }
    const ok = await bcrypt.compare(token, (user as any).googleLinkToken);
    if (!ok) throw new UnauthorizedException('Invalid or expired link');
    await this.users.addProvider(user.id, 'google');
    await this.users.clearGoogleLinkToken(user.id);
    return { status: 'ok', email: user.email };
  }

  /** Issue a fresh token if the current user is still valid and active. */
  async refreshToken(userId: string, role: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account deactivated or not found');
    }
    const token = this.signToken(user.id, user.role);
    return {
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, school: user.school },
    };
  }

  private signToken(userId: string, role: string): string {
    return this.jwt.sign({ sub: userId, role }, { expiresIn: '24h' });
  }
}
