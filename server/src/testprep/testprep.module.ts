import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ConsentModule } from '../consent/consent.module';
import { UsersModule } from '../users/users.module';
import { AttemptsModule } from '../attempts/attempts.module';
import { TestPrepController } from './testprep.controller';
import { TestPrepProcessor } from './testprep.processor';

@Module({
  imports: [
    ConfigModule,
    ConsentModule,
    UsersModule,
    AttemptsModule,
    BullModule.registerQueue({ name: 'testprep' }),
  ],
  controllers: [TestPrepController],
  providers: [TestPrepProcessor],
})
export class TestPrepModule {}
