import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { PrivacyService } from './privacy.service';
import { AuditService } from '../audit/audit.service';
import { DeletionRequestDto } from './privacy.dto';

@ApiTags('Privacy')
@Controller('api/privacy')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class PrivacyController {
  constructor(
    private privacy: PrivacyService,
    private audit: AuditService,
  ) {}

  @Post('deletion-request')
  @ApiOperation({ summary: 'Request deletion of all data for a student' })
  async deletionRequest(@Body() dto: DeletionRequestDto, @Request() req: any) {
    const result = await this.privacy.deleteStudentData(
      dto.studentSpeakerId,
      req.user.schoolId,
      { userId: req.user.userId, email: req.user.email },
    );
    return { deleted: result };
  }

  @Get('audit-trail')
  @Roles('admin')
  @ApiOperation({ summary: 'Get audit trail for school (admin only)' })
  async getAuditTrail(
    @Request() req: any,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.audit.getAuditTrail(req.user.schoolId, {
      action: action as any,
      userId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('retention-policy')
  @ApiOperation({ summary: 'Get data retention policy' })
  getRetentionPolicy() {
    return this.privacy.getRetentionPolicy();
  }
}
