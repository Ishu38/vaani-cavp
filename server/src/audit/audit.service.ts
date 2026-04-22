import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditAction } from './audit.schema';

export interface AuditLogOptions {
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  schoolId?: string;
}

export interface AuditTrailOptions {
  action?: AuditAction;
  userId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLog>,
  ) {}

  /**
   * Fire-and-forget audit log entry. Errors are caught silently.
   */
  log(
    action: AuditAction | string,
    userId: string,
    userEmail: string,
    opts: AuditLogOptions = {},
  ): void {
    this.auditModel
      .create({
        userId,
        userEmail,
        action,
        targetId: opts.targetId,
        targetType: opts.targetType,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        metadata: opts.metadata,
        schoolId: opts.schoolId,
      })
      .catch(() => {
        // Silently ignore audit logging errors
      });
  }

  async getAuditTrail(
    schoolId: string,
    opts: AuditTrailOptions = {},
  ): Promise<AuditLog[]> {
    const query: Record<string, any> = { schoolId };

    if (opts.action) {
      query.action = opts.action;
    }
    if (opts.userId) {
      query.userId = opts.userId;
    }

    const limit = opts.limit || 100;
    const offset = opts.offset || 0;

    return this.auditModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(Math.min(limit, 1000))
      .exec();
  }
}
