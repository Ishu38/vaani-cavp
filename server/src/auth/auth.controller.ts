import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { StorageService } from '../storage/storage.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

/** Set httpOnly cookie with the JWT token — immune to XSS theft */
function setTokenCookie(res: Response, token: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. ".vaaani.in" in prod
  const opts: any = {
    httpOnly: true,          // JavaScript cannot read this cookie
    secure: isProduction,    // HTTPS-only in production
    sameSite: 'strict' as const,      // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours (matches JWT expiry)
    path: '/',
  };
  if (cookieDomain) opts.domain = cookieDomain;
  res.cookie('vp_token', token, opts);
}

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private storage: StorageService,
  ) {}

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new teacher/admin account' })
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.auth.signup(dto);
    setTokenCookie(res, data.access_token);
    return data;
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login and receive JWT token' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.auth.login(dto);
    setTokenCookie(res, data.access_token);
    return data;
  }

  @Post('google')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign in with a Google Identity Services ID token (credential)' })
  async google(
    @Body() body: { credential?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.loginWithGoogle(body?.credential || '');
    setTokenCookie(res, data.access_token);
    return data;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Clear auth cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    // clearCookie must match the domain used when setting, otherwise
    // browsers won't find a match to expire.
    const cookieDomain = process.env.COOKIE_DOMAIN;
    const clearOpts: any = { path: '/' };
    if (cookieDomain) clearOpts.domain = cookieDomain;
    res.clearCookie('vp_token', clearOpts);
    return { status: 'ok' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Request() req) {
    return this.auth.getProfile(req.user.userId);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update candidate profile fields' })
  async updateProfile(
    @Request() req,
    @Body() body: {
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
  ) {
    return this.auth.updateCandidateProfile(req.user.userId, body || {});
  }

  @Post('avatar')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload profile avatar (PNG/JPEG, ≤2MB)' })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only PNG, JPEG, or WebP images are accepted'), false);
      },
    }),
  )
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Request() req) {
    if (!file) throw new BadRequestException('avatar file is required');
    const url = await this.storage.uploadAvatar(req.user.userId, file.buffer, file.mimetype);
    return this.auth.setAvatarUrl(req.user.userId, url);
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh JWT token (sliding window)' })
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const data = await this.auth.refreshToken(req.user.userId, req.user.role);
    setTokenCookie(res, data.access_token);
    return data;
  }

  // ── Verification + reset + Google link ────────────────────────────────

  @Post('verify-email/resend')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Resend the email-verification link to the signed-in user' })
  resendVerification(@Request() req) {
    return this.auth.sendVerificationEmail(req.user.userId);
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm email with the token from the verification email' })
  verifyEmail(@Body() body: { email?: string; token?: string }) {
    return this.auth.confirmEmail(body?.email || '', body?.token || '');
  }

  @Post('password-reset/request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Send a password-reset link to the email address' })
  requestPasswordReset(@Body() body: { email?: string }) {
    return this.auth.requestPasswordReset(body?.email || '');
  }

  @Post('password-reset/confirm')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm password reset with the token from the reset email' })
  confirmPasswordReset(@Body() body: { email?: string; token?: string; newPassword?: string }) {
    return this.auth.confirmPasswordReset(body?.email || '', body?.token || '', body?.newPassword || '');
  }

  @Post('link-google/confirm')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm linking Google sign-in to an existing password account' })
  confirmGoogleLink(@Body() body: { email?: string; token?: string }) {
    return this.auth.confirmGoogleLink(body?.email || '', body?.token || '');
  }
}
