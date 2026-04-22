import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { ClassesService } from './classes.service';
import {
  CreateClassroomDto,
  UpdateClassroomDto,
  CreateStudentDto,
} from './classes.dto';

@ApiTags('Classes')
@Controller('api')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ClassesController {
  constructor(private classes: ClassesService) {}

  // ── Classrooms ──

  @Post('classes')
  @ApiOperation({ summary: 'Create a new classroom' })
  async createClassroom(@Body() dto: CreateClassroomDto, @Request() req: any) {
    return this.classes.createClassroom(dto, req.user.userId, req.user.schoolId);
  }

  @Get('classes')
  @ApiOperation({ summary: 'List classrooms (teacher sees own, admin sees all in school)' })
  async listClassrooms(@Request() req: any) {
    if (req.user.role === 'admin') {
      return this.classes.getSchoolClassrooms(req.user.schoolId);
    }
    return this.classes.getTeacherClassrooms(req.user.userId);
  }

  @Get('classes/:id')
  @ApiOperation({ summary: 'Get classroom details' })
  async getClassroom(@Param('id') id: string, @Request() req: any) {
    return this.classes.getClassroomById(id, req.user);
  }

  @Put('classes/:id')
  @ApiOperation({ summary: 'Update classroom' })
  async updateClassroom(
    @Param('id') id: string,
    @Body() dto: UpdateClassroomDto,
    @Request() req: any,
  ) {
    return this.classes.updateClassroom(id, dto, req.user);
  }

  @Delete('classes/:id')
  @ApiOperation({ summary: 'Soft-delete classroom' })
  async deleteClassroom(@Param('id') id: string, @Request() req: any) {
    return this.classes.deleteClassroom(id, req.user);
  }

  // ── Students ──

  @Post('classes/:id/students')
  @ApiOperation({ summary: 'Add a student to a classroom' })
  async addStudent(
    @Param('id') classroomId: string,
    @Body() dto: CreateStudentDto,
    @Request() req: any,
  ) {
    return this.classes.addStudent(classroomId, dto, req.user.userId, req.user.schoolId);
  }

  @Get('classes/:id/students')
  @ApiOperation({ summary: 'Get classroom roster' })
  async getClassroomRoster(@Param('id') classroomId: string, @Request() req: any) {
    return this.classes.getClassroomRoster(classroomId, req.user);
  }

  @Delete('classes/:id/students/:studentId')
  @ApiOperation({ summary: 'Remove student from classroom (soft delete)' })
  async removeStudent(@Param('studentId') studentId: string, @Request() req: any) {
    return this.classes.removeStudent(studentId, req.user);
  }

  // ── Analytics ──

  @Get('classes/:id/analytics')
  @ApiOperation({ summary: 'Get per-student analytics for a classroom (paginated)' })
  async getClassroomAnalytics(
    @Param('id') classroomId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    return this.classes.getClassroomAnalytics(classroomId, req.user, p, l);
  }

  // ── Dashboard ──

  @Get('dashboard')
  @ApiOperation({ summary: 'Get teacher dashboard stats' })
  async getDashboardStats(@Request() req: any) {
    return this.classes.getDashboardStats(req.user.userId, req.user.schoolId);
  }
}
