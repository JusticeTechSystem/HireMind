import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { codingRequestSchema, systemDesignRequestSchema } from '@hiremind/validation';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { parse } from '../common/parse';
import { ToolsService } from './tools.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Throttle({ default: { limit: 15, ttl: 60_000 } })
export class ToolsController {
  constructor(private svc: ToolsService) {}
  @Post('coding/solve') solve(@CurrentUser() u: AuthUser, @Body() b: unknown) { return this.svc.solve(u.id, parse(codingRequestSchema, b)); }
  @Post('system-design') design(@CurrentUser() u: AuthUser, @Body() b: unknown) { return this.svc.design(u.id, parse(systemDesignRequestSchema, b).prompt); }
}
