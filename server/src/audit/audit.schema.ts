import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum AuditAction {
  AUDIO_UPLOAD = 'audio_upload',
  ANALYSIS_RUN = 'analysis_run',
  ANALYSIS_COMPLETE = 'analysis_complete',
  PROFILE_VIEW = 'profile_view',
  PROFILE_EXPORT = 'profile_export',
  DATA_DELETION = 'data_deletion',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  CONSENT_REQUESTED = 'consent_requested',
  LOGIN = 'login',
  SIGNUP = 'signup',
  LOGOUT = 'logout',
}

@Schema({ timestamps: true, collection: 'auditlogs' })
export class AuditLog extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop()
  userEmail: string;

  @Prop({ required: true, type: String, enum: AuditAction })
  action: AuditAction;

  @Prop()
  targetId: string;

  @Prop()
  targetType: string;

  @Prop()
  ipAddress: string;

  @Prop()
  userAgent: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ index: true })
  schoolId: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// TTL index: auto-delete after 730 days (2 years)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 730 * 24 * 60 * 60 });
