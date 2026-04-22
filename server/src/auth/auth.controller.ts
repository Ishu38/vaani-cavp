import { Controller, Post, Get, Body, UseGuards, Request, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

/** Set httpOnly cookie with the JWT token — immune to XSS theft */
function setTokenCookie(res: Response, token: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('vp_token', token, {
    httpOnly: true,          // JavaScript cannot read this cookie
    secure: isProduction,    // HTTPS-only in production
    sameSite: 'strict',      // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours (matches JWT expiry)
    path: '/',
  });
}

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

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

  @Post('logout')
  @ApiOperation({ summary: 'Clear auth cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('vp_token', { path: '/' });
    return { status: 'ok' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Request() req) {
    return this.auth.getProfile(req.user.userId);
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
}
