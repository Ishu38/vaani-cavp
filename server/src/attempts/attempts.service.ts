import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attempt } from './attempt.schema';

@Injectable()
export class AttemptsService {
  constructor(@InjectModel(Attempt.name) private model: Model<Attempt>) {}

  /** Persist a scored attempt for a signed-in user. Returns the created doc.
   *  Failure is the caller's responsibility — testprep wraps this in try/catch
   *  so a transient Mongo blip never blocks the user's score. */
  async create(data: {
    userId: string;
    testType: 'ielts' | 'toefl';
    bandOverall?: string;
    bands?: Record<string, any>;
    acoustic?: Record<string, any>;
    transcript?: string;
    promptId?: string;
    promptText?: string;
    l1Language?: string;
    feedback?: Record<string, any>;
  }): Promise<Attempt> {
    return this.model.create({
      ...data,
      userId: new Types.ObjectId(data.userId),
    });
  }

  /** Count attempts a user has made since `since`. Used by the testprep
   *  controller to enforce the free-tier monthly quota before queueing a
   *  fresh engine job. Counts both ielts and toefl by default — the
   *  pricing copy promises "3 IELTS or TOEFL mocks per month" as one
   *  combined quota.
   */
  async countForUserSince(userId: string, since: Date, testType?: 'ielts' | 'toefl'): Promise<number> {
    const filter: Record<string, any> = {
      userId: new Types.ObjectId(userId),
      createdAt: { $gte: since },
    };
    if (testType) filter.testType = testType;
    return this.model.countDocuments(filter).exec();
  }

  async listForUser(userId: string, limit = 50): Promise<Attempt[]> {
    return this.model
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findByIdForUser(id: string, userId: string): Promise<Attempt> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Attempt not found');
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();
    if (!doc) throw new NotFoundException('Attempt not found');
    return doc;
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Attempt not found');
    const r = await this.model
      .deleteOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();
    if (r.deletedCount === 0) throw new NotFoundException('Attempt not found');
  }
}
