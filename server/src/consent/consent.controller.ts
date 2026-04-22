import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { ConsentService } from './consent.service';
import { RequestConsentDto } from './consent.dto';

@ApiTags('Consent')
@Controller('api/consent')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ConsentController {
  constructor(private consent: ConsentService) {}

  @Post('request')
  @ApiOperation({ summary: 'Request parental consent for a student' })
  async requestConsent(@Body() dto: RequestConsentDto, @Request() req: any) {
    return this.consent.requestConsent(dto, req.user.userId, req.user.schoolId);
  }

  @Put('verify/:id')
  @ApiOperation({ summary: 'Verify (grant) a consent record' })
  async verifyConsent(@Param('id') id: string) {
    return this.consent.verifyConsent(id);
  }

  @Put('revoke/:studentSpeakerId')
  @ApiOperation({ summary: 'Revoke all consent for a student' })
  async revokeConsent(
    @Param('studentSpeakerId') studentSpeakerId: string,
    @Request() req: any,
  ) {
    await this.consent.revokeConsent(studentSpeakerId, req.user.schoolId);
    return { message: 'Consent revoked' };
  }

  @Get('status/:studentSpeakerId')
  @ApiOperation({ summary: 'Get consent status for a student' })
  async getConsentStatus(
    @Param('studentSpeakerId') studentSpeakerId: string,
    @Request() req: any,
  ) {
    return this.consent.getConsentStatus(studentSpeakerId, req.user.schoolId);
  }
}
