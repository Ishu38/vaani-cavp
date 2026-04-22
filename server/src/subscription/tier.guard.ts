import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';

/**
 * Guard that checks if the school has remaining quota before allowing analysis.
 * Apply to analysis endpoints: @UseGuards(AuthGuard('jwt'), RolesGuard, TierGuard)
 */
@Injectable()
export class TierGuard implements CanActivate {
  constructor(private subscription: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const schoolId = request.user?.schoolId;

    if (!schoolId) {
      // No school context — let other guards handle auth
      return true;
    }

    // Throws ForbiddenException if over quota
    await this.subscription.checkQuota(schoolId);
    return true;
  }
}
