import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ConsentModule } from './consent/consent.module';
import { AuditModule } from './audit/audit.module';
import { PrivacyModule } from './privacy/privacy.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ClassesModule } from './classes/classes.module';
import { HealthController } from './common/health.controller';
import { ReportController } from './common/report.controller';
import { CsrfMiddleware } from './common/csrf.middleware';

@Module({
  imports: [
    // Environment config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get('MONGO_URI', 'mongodb://localhost:27017/contrastive_voice'),
      }),
    }),

    // Redis + BullMQ job queue
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD', undefined),
        },
      }),
    }),

    // Scheduled tasks (data retention cron)
    ScheduleModule.forRoot(),

    // Rate limiting — 60 requests per minute per IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),

    // Feature modules
    AuthModule,
    UsersModule,
    AnalysisModule,
    ProfilesModule,
    ConsentModule,
    AuditModule,
    PrivacyModule,
    SubscriptionModule,
    ClassesModule,
  ],
  controllers: [HealthController, ReportController],
  providers: [
    // Apply ThrottlerGuard globally so @Throttle() decorators take effect
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
