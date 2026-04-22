import { Controller, Get, Param, Query, UseGuards, Request, ParseIntPipe, DefaultValuePipe, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { ProfilesService } from './profiles.service';

@ApiTags('Profiles')
@Controller('api/profiles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ProfilesController {
  constructor(private profiles: ProfilesService) {}

  // Specific routes MUST come before the catch-all :id param

  @Get('trajectory/:speakerId')
  @ApiOperation({ summary: 'Get all profiles for a speaker over time' })
  getTrajectory(
    @Param('speakerId') speakerId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Request() req: any,
  ) {
    return this.profiles.getTrajectory(speakerId, Math.min(limit, 500), req.user);
  }

  @Get('school/:schoolId')
  @Roles('admin', 'teacher')
  @ApiOperation({ summary: 'Get all profiles for a school (admin/teacher only)' })
  getSchoolProfiles(@Param('schoolId') schoolId: string, @Request() req: any) {
    // Non-admin users can only query their own school
    if (req.user.role !== 'admin' && req.user.schoolId !== schoolId) {
      throw new ForbiddenException('You can only access your own school\'s profiles');
    }
    return this.profiles.getSchoolProfiles(schoolId);
  }

  @Get('report/:id')
  @ApiOperation({ summary: 'Get a contrastive report by ID' })
  getReport(@Param('id') id: string, @Request() req: any) {
    return this.profiles.findReportById(id, req.user);
  }

  @Get('reports/:speakerId')
  @ApiOperation({ summary: 'Get all contrastive reports for a speaker' })
  getReportsBySpeaker(@Param('speakerId') speakerId: string, @Request() req: any) {
    return this.profiles.getReportsBySpeaker(speakerId, req.user);
  }

  // Catch-all :id route LAST
  @Get(':id')
  @ApiOperation({ summary: 'Get a voice profile by ID' })
  getProfile(@Param('id') id: string, @Request() req: any) {
    return this.profiles.findById(id, req.user);
  }
}
