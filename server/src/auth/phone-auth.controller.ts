import { Controller, Post, Body, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { PhoneAuthService } from './phone-auth.service';

@Controller('api/auth/phone')
export class PhoneAuthController {
  constructor(private readonly phoneAuthService: PhoneAuthService) {}

  @Post('send')
  @HttpCode(200)
  async sendOtp(@Body('phone') phone: string): Promise<{ status: string; expiresIn: number }> {
    if (!phone) throw new (require('@nestjs/common').BadRequestException)('Phone number is required');
    return this.phoneAuthService.sendOtp(phone);
  }

  @Post('verify')
  async verifyOtp(
    @Body('phone') phone: string,
    @Body('otp') otp: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!phone || !otp) {
      throw new (require('@nestjs/common').BadRequestException)('Phone and OTP are required');
    }
    const data = await this.phoneAuthService.verifyOtp(phone, otp);

    // Set JWT as httpOnly cookie (same as email/google auth)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN;
    const opts: any = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    };
    if (cookieDomain) opts.domain = cookieDomain;
    res.cookie('vp_token', data.access_token, opts);

    return data;
  }
}
