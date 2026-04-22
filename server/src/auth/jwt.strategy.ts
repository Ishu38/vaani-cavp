import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../users/users.service';

/** Extract JWT from httpOnly cookie first, then fall back to Authorization header */
function extractJwtFromCookieOrHeader(req: Request): string | null {
  // 1. Try httpOnly cookie (secure — immune to XSS)
  if (req.cookies?.vp_token) {
    return req.cookies.vp_token;
  }
  // 2. Fall back to Authorization: Bearer header (for API clients / Swagger)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private users: UsersService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account deactivated or not found');
    }
    return { userId: payload.sub, email: user.email, role: user.role, school: user.school, schoolId: user.schoolId };
  }
}
