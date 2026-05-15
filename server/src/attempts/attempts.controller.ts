import { Controller, Delete, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttemptsService } from './attempts.service';
import type { Attempt } from './attempt.schema';

function serialize(a: Attempt) {
  const o = a.toObject ? a.toObject() : (a as any);
  return {
    id: String(o._id),
    testType: o.testType,
    bandOverall: o.bandOverall || null,
    bands: o.bands || {},
    acoustic: o.acoustic || {},
    transcript: o.transcript || '',
    promptId: o.promptId || '',
    promptText: o.promptText || '',
    l1Language: o.l1Language || '',
    feedback: o.feedback || {},
    createdAt: o.createdAt,
  };
}

@ApiTags('Attempts')
@Controller('api/attempts')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: "List the signed-in user's saved attempts" })
  async list(@Req() req: any) {
    const docs = await this.attempts.listForUser(req.user.userId);
    // List view only needs the summary fields — strip heavy acoustic + feedback.
    return docs.map((d) => {
      const s = serialize(d);
      return {
        id: s.id,
        testType: s.testType,
        bandOverall: s.bandOverall,
        promptText: s.promptText,
        createdAt: s.createdAt,
      };
    });
  }

  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Fetch a single attempt with full acoustic + feedback' })
  async detail(@Param('id') id: string, @Req() req: any) {
    const doc = await this.attempts.findByIdForUser(id, req.user.userId);
    return serialize(doc);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete one of the signed-in user\'s attempts' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.attempts.deleteForUser(id, req.user.userId);
    return { status: 'ok' };
  }
}
