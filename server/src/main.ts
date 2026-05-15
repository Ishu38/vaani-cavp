import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { mkdirSync } from 'fs';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SpaFallbackFilter } from './common/spa-fallback.filter';

async function bootstrap() {
  // Ensure uploads directory exists before Multer tries to write
  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');
  mkdirSync(uploadDir, { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Security headers with a CSP that allows third-party auth + map embeds.
  // Default helmet CSP is `script-src 'self'`, which blocks Google Identity
  // Services from loading. Whitelist the exact origins we use.
  //
  // Trade-offs:
  //   - 'unsafe-inline' on script-src is required by Google Identity Services
  //     (the GSI client injects an inline bootstrap script in its iframe).
  //     Removing it requires moving to a nonce-based CSP with a server-rendered
  //     <script nonce> on every inline script — a refactor tracked separately.
  //   - 'unsafe-inline' on style-src is required by Vite's runtime and several
  //     React libraries that inject <style> tags. Same nonce refactor would
  //     fix it. Until then, sameSite=strict cookies + CSRF double-submit are
  //     the primary XSS-mitigation belt.
  //   - img-src and font-src no longer use the blanket 'https:' — only the
  //     specific hosts we actually load from.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': [
            "'self'",
            "'unsafe-inline'", // TODO: replace with per-request nonces
            'https://accounts.google.com',
            'https://apis.google.com',
            'https://maps.google.com',
            'https://maps.googleapis.com',
          ],
          'script-src-elem': [
            "'self'",
            "'unsafe-inline'", // TODO: replace with per-request nonces
            'https://accounts.google.com',
            'https://apis.google.com',
          ],
          'connect-src': [
            "'self'",
            'https://accounts.google.com',
            'https://apis.google.com',
          ],
          'frame-src': [
            "'self'",
            'https://accounts.google.com',
            'https://content-accounts.googleapis.com',
            'https://maps.google.com',
            'https://www.google.com',
          ],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://lh3.googleusercontent.com', // Google account avatars
            'https://maps.googleapis.com',
            'https://maps.gstatic.com',
          ],
          'style-src': [
            "'self'",
            "'unsafe-inline'", // TODO: nonce refactor
            'https://accounts.google.com',
            'https://fonts.googleapis.com',
          ],
          'style-src-elem': [
            "'self'",
            "'unsafe-inline'", // TODO: nonce refactor
            'https://accounts.google.com',
            'https://fonts.googleapis.com',
          ],
          'font-src': [
            "'self'",
            'data:',
            'https://fonts.gstatic.com',
          ],
          'media-src': ["'self'", 'blob:', 'data:'],
        },
      },
      // The Identity Services popup uses window.postMessage; relax referrer
      // policy slightly so Google can verify the opener origin.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Parse cookies so JWT can be read from httpOnly cookie
  app.use(cookieParser());

  // SPA fallback — return client/dist/index.html for unknown non-API GETs
  // so React Router routes (e.g. /about, /methodology) work on direct hits.
  app.useGlobalFilters(new SpaFallbackFilter());

  // Global validation pipe — rejects malformed requests
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — locked to known origins in production
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Swagger API docs at /docs — disabled in production
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('VoiceProfile API')
      .setDescription('Contrastive Acoustic Voice Profiling — API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, doc);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Server running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
