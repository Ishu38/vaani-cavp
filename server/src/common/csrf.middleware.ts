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
 *   - /api/auth/login, /api/auth/signup, /api/auth/logout, /api/auth/google
 *     (no CSRF cookie exists pre-auth, and these are protected by sameSite +
 *     password/OAuth verification on their own)
 *   - /api/health (no auth, read-only)
 *
 * NOTE: state-changing /api/testprep/* routes (POST analyze/report/consent/
 * guidance/ask) are NOT exempted — the SPA reads the vp_csrf cookie via
 * document.cookie and sends it back in the X-CSRF-Token header. A blanket
 * /api/testprep prefix exemption used to live here; it disabled CSRF on
 * every state-changing testprep route (analyze/report/consent/revoke) and
 * was removed after CodeRabbit flagged it.
 */
const CSRF_COOKIE = 'vp_csrf';
const CSRF_HEADER = 'x-csrf-token';
const EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/google',
  '/api/auth/phone/send',
  '/api/auth/phone/verify',
  '/api/health',
];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Always ensure a CSRF token cookie exists
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = crypto.randomBytes(32).toString('hex');
      const isProduction = process.env.NODE_ENV === 'production';
      // COOKIE_DOMAIN must be set in production (e.g. ".vaaani.in") so the
      // SPA at app.vaaani.in can read this cookie via document.cookie even
      // though it's set by api.vaaani.in. Without a parent-domain scope,
      // browsers tie the cookie to the host that set it — meaning the
      // double-submit pattern silently fails cross-subdomain. In dev
      // (localhost) leave COOKIE_DOMAIN unset so the cookie is host-scoped.
      const cookieDomain = process.env.COOKIE_DOMAIN;
      const cookieOpts: any = {
        httpOnly: false,   // JS must be able to read this
        secure: isProduction,
        sameSite: 'strict' as const,
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      };
      if (cookieDomain) cookieOpts.domain = cookieDomain;
      res.cookie(CSRF_COOKIE, token, cookieOpts);
    }

    // Safe methods and exempt paths skip validation
    if (SAFE_METHODS.includes(req.method)) {
      return next();
    }
    const fullPath = req.originalUrl || req.url || req.path;
    if (EXEMPT_PATHS.some((p) => fullPath.startsWith(p))) {
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
