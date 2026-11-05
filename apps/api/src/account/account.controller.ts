import { Body, Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { parse } from '../common/parse';
import { AccountService } from './account.service';

@Controller('account')
@UseGuards(AuthGuard, RolesGuard)
export class AccountDataController {
  constructor(private svc: AccountService) {}
  @Get('export') @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) export(@CurrentUser() u: AuthUser) { return this.svc.export(u.id); }
  @Delete() @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) delete(@CurrentUser() u: AuthUser, @Body() b: unknown) { parse(z.object({ confirm: z.literal('DELETE') }), b); return this.svc.delete(u.id); }
}
