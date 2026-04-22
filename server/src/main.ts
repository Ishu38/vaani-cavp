import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { mkdirSync } from 'fs';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // Ensure uploads directory exists before Multer tries to write
  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');
  mkdirSync(uploadDir, { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // Parse cookies so JWT can be read from httpOnly cookie
  app.use(cookieParser());

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
