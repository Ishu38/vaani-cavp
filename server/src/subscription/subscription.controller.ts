import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { SubscriptionService } from './subscription.service';
import { Tier } from './subscription.schema';

class ActivatePlanDto {
  @ApiProperty({ example: 'DPS-PAT-001' })
  @IsString()
  schoolId: string;

  @ApiProperty({ enum: Tier, example: Tier.SCHOOL_PRO })
  @IsEnum(Tier)
  tier: Tier;

  @ApiProperty({ example: 30, description: 'Duration in days' })
  @IsNumber()
  @Min(1)
  @Max(365)
  durationDays: number;

  @ApiProperty({ example: 'UPI-TXN-123456789' })
  @IsString()
  upiTransactionId: string;

  @ApiPropertyOptional({ example: 'Payment verified via PhonePe screenshot' })
  @IsOptional()
  @IsString()
  notes?: string;
}

class DeactivateDto {
  @ApiProperty({ example: 'DPS-PAT-001' })
  @IsString()
  schoolId: string;
}

@ApiTags('Subscription')
@Controller('api/subscription')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current school subscription status and usage' })
  async getStatus(@Request() req: any) {
    return this.subscription.getStatus(req.user.schoolId);
  }

  // ── Admin-only endpoints ──

  @Post('activate')
  @Roles('admin')
  @ApiOperation({ summary: 'Activate a plan for a school (admin only, after UPI verification)' })
  async activatePlan(@Body() dto: ActivatePlanDto, @Request() req: any) {
    const sub = await this.subscription.activatePlan(
      dto.schoolId,
      dto.tier,
      dto.durationDays,
      req.user.userId,
      dto.upiTransactionId,
      dto.notes,
    );
    return {
      status: 'activated',
      schoolId: dto.schoolId,
      tier: dto.tier,
      expiresAt: sub.expiresAt,
    };
  }

  @Post('deactivate')
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate a school subscription (admin only)' })
  async deactivate(@Body() dto: DeactivateDto) {
    await this.subscription.deactivatePlan(dto.schoolId);
    return { status: 'deactivated', schoolId: dto.schoolId };
  }

  @Get('all')
  @Roles('admin')
  @ApiOperation({ summary: 'List all active subscriptions (admin only)' })
  async listAll() {
    return this.subscription.listActiveSubscriptions();
  }
}
