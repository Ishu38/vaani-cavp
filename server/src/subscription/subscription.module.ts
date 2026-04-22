import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscription, SubscriptionSchema } from './subscription.schema';
import { UsageRecord, UsageRecordSchema } from './usage.schema';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { TierGuard } from './tier.guard';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: UsageRecord.name, schema: UsageRecordSchema },
    ]),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, TierGuard],
  exports: [SubscriptionService, TierGuard],
})
export class SubscriptionModule {}
