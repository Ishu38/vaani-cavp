import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('api')
export class HealthController {
  private readonly engineUrl: string;

  constructor(private config: ConfigService) {
    this.engineUrl = this.config.get('FASTAPI_URL', 'http://localhost:8000');
  }

  @Get('health')
  @ApiOperation({ summary: 'System health check — aggregates NestJS gateway + FastAPI engine status' })
  async health() {
    const gateway = { status: 'ok', service: 'nestjs-gateway' };

    let engine = { status: 'unreachable' as string, modules: [] as string[] };
    try {
      const res = await fetch(`${this.engineUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        engine = await res.json();
      }
    } catch {}

    return {
      status: engine.status === 'ok' ? 'ok' : 'degraded',
      gateway,
      engine,
    };
  }
}
