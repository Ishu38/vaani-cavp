import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * CSRF Double-Submit Cookie Middleware
 *
 * Defense-in-depth CSRF protection alongside sameSite: 'strict' cookies.
 *
 * Strategy: Double-Submit Cookie pattern
 *   1. On every response, set a non-httpOnly CSRF token cookie (readable by JS)
 *   2. On state-changing requests (POST/PUT/DELETE/PATCH), require the
 *      X-CSRF-Token header to match the cookie value
 *
 * Why this works:
 *   - An attacker's cross-origin form/fetch can send cookies but CANNOT read
 *     them (same-origin policy), so they can't set the matching header.
 *   - Combined with sameSite: 'strict', this is belt-and-suspenders.
 *
 * Excluded paths:
 *   - /api/auth/login and /api/auth/signup (no cookie exists yet)
 *   - /api/health (no authentication needed)
 */
const CSRF_COOKIE = 'vp_csrf';
const CSRF_HEADER = 'x-csrf-token';
const EXEMPT_PATHS = ['/api/auth/login', '/api/auth/signup', '/api/auth/logout', '/api/health'];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Always ensure a CSRF token cookie exists
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = crypto.randomBytes(32).toString('hex');
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,   // JS must be able to read this
        secure: isProduction,
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }

    // Safe methods and exempt paths skip validation
    if (SAFE_METHODS.includes(req.method)) {
      return next();
    }
    if (EXEMPT_PATHS.some((p) => req.path.startsWith(p))) {
      return next();
    }

    // Validate: header must match cookie
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER] as string;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      res.status(403).json({
        statusCode: 403,
        message: 'CSRF token validation failed',
        error: 'Forbidden',
      });
      return;
    }

    next();
  }
}
