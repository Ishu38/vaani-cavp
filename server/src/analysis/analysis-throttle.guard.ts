import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

/**
 * Per-user throttle guard for analysis endpoints.
 * Keys rate limits by authenticated userId instead of IP address,
 * so a single authenticated user can't hammer the GPU pipeline.
 *
 * Limits: 20 analysis submissions per 5-minute window per user.
 */
@Injectable()
export class AnalysisThrottleGuard extends ThrottlerGuard {
  /** Key by userId (from JWT) instead of IP */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.userId;
    return userId ? `analysis_throttle_${userId}` : req.ip;
  }

  /** Custom error message for analysis rate limits */
  protected async throwThrottlingException(
    context: ExecutionContext,
  ): Promise<void> {
    throw new ThrottlerException(
      'Analysis rate limit exceeded — please wait a few minutes before submitting more files. ' +
      'This protects GPU resources for all users.',
    );
  }
}
