import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { User } from '../users/user.schema';
import { UsersService } from '../users/users.service';

interface OtpRecord {
  otp: string;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class PhoneAuthService {
  private readonly logger = new Logger(PhoneAuthService.name);
  private otpStore = new Map<string, OtpRecord>(); // phone -> OTP record

  // Clean expired OTPs every 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {
    this.cleanupInterval = setInterval(() => this.cleanExpiredOtps(), 5 * 60 * 1000);
  }

  private cleanExpiredOtps() {
    const now = Date.now();
    for (const [phone, record] of this.otpStore) {
      if (record.expiresAt < now) this.otpStore.delete(phone);
    }
  }

  /**
   * Send OTP to phone number.
   * Uses MSG91 for SMS when configured; otherwise logs OTP for development.
   */
  async sendOtp(phone: string): Promise<{ status: string; expiresIn: number }> {
    // Normalize phone: strip spaces, ensure India +91 prefix
    phone = phone.replace(/\s+/g, '');
    if (!phone.startsWith('+')) {
      if (phone.length === 10) phone = '+91' + phone;
      else if (phone.startsWith('91') && phone.length === 12) phone = '+' + phone;
      else throw new BadRequestException('Invalid phone number. Use 10-digit Indian number.');
    }

    // Rate limit: max 3 OTPs per 5 minutes per phone
    const existing = this.otpStore.get(phone);
    if (existing && existing.attempts >= 3) {
      throw new BadRequestException('Too many OTP requests. Please wait 5 minutes.');
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    this.otpStore.set(phone, {
      otp,
      expiresAt,
      attempts: (existing?.attempts || 0) + 1,
    });

    // Send via MSG91 or log in development
    const msg91Key = process.env.MSG91_AUTH_KEY;
    if (msg91Key) {
      try {
        const resp = await fetch(`https://control.msg91.com/api/v5/flow/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authkey: msg91Key,
          },
          body: JSON.stringify({
            template_id: process.env.MSG91_OTP_TEMPLATE_ID || 'your_template_id',
            sender: 'VAANI',
            mobiles: phone.replace('+', ''),
            OTP: otp,
          }),
        });
        if (!resp.ok) {
          this.logger.warn(`MSG91 OTP send failed: ${resp.status}`);
        }
      } catch (e) {
        this.logger.warn(`MSG91 OTP send error: ${e}`);
      }
    } else {
      this.logger.log(`[DEV] OTP for ${phone}: ${otp}`);
    }

    const expiresIn = 300; // 5 minutes in seconds
    return { status: 'ok', expiresIn };
  }

  /**
   * Verify OTP and authenticate user.
   * Creates user if phone is not registered, logs in if already exists.
   */
  async verifyOtp(phone: string, otp: string): Promise<{
    access_token: string;
    user: { id: string; name: string; email: string; phone: string; role: string; provider: string };
  }> {
    phone = phone.replace(/\s+/g, '');
    if (!phone.startsWith('+')) {
      if (phone.length === 10) phone = '+91' + phone;
      else throw new BadRequestException('Invalid phone number');
    }

    const record = this.otpStore.get(phone);
    if (!record) {
      throw new UnauthorizedException('No OTP requested for this number. Please request OTP first.');
    }
    if (record.expiresAt < Date.now()) {
      this.otpStore.delete(phone);
      throw new UnauthorizedException('OTP expired. Please request a new one.');
    }
    if (record.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP. Please try again.');
    }

    // OTP verified — remove from store
    this.otpStore.delete(phone);

    // Find or create user
    let user = await this.userModel.findOne({ phone }).exec();
    if (!user) {
      // Create new phone-authenticated user
      const fillerEmail = `phone_${phone.replace(/\D/g, '')}@vaani.user`;
      const fillerPassword = crypto.randomBytes(32).toString('hex');
      user = await this.usersService.create({
        name: `User${phone.slice(-4)}`,
        email: fillerEmail,
        phone,
        password: fillerPassword,
        role: 'student',
        providers: ['phone'],
      } as any);
    } else {
      // Existing user — ensure phone provider is in providers array
      if (!user.providers.includes('phone')) {
        user.providers.push('phone');
        await user.save();
      }
    }

    // Issue JWT
    const payload = { sub: user._id.toString(), role: user.role };
    const access_token = this.jwtService.sign(payload, { expiresIn: '24h' });

    return {
      access_token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone || phone,
        role: user.role,
        provider: 'phone',
      },
    };
  }
}
