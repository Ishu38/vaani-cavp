import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsentRecord, ConsentRecordSchema } from './consent.schema';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConsentRecord.name, schema: ConsentRecordSchema },
    ]),
  ],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
