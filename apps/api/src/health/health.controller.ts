import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { integrationStatus, loadEnv } from '@hiremind/config';
import type { HealthResponse } from '@hiremind/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly prisma?: PrismaService) {}
  /** Liveness: process is up. Also reports which integrations have credentials (booleans only). */
  @Get() check(): HealthResponse { return { status: 'ok', time: new Date().toISOString(), integrations: integrationStatus(loadEnv()) }; }
  /** Readiness: the database answers. Point the load balancer / orchestrator probe here. */
  @Get('ready') async ready() {
    if (!this.prisma) throw new ServiceUnavailableException('database not wired');
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException('database unavailable'); }
    return { status: 'ready' };
  }
}
