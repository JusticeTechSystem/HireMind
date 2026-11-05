import { IdempotencyInterceptor } from '../common/idempotency';
import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, Roles, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { parse } from '../common/parse';
import { AdminService } from './admin.service';
import { AiMonitorService } from './ai-monitor';
import { announcementSchema, planCodeSchema, planUpdateSchema, pricingSchema, reasonSchema, roleSchema, supportSchema, ticketUpdateSchema } from './admin.schemas';

const page = () => Query('page', new DefaultValuePipe(1), ParseIntPipe);
const uuid = (n: string) => Param(n, ParseUUIDPipe);

/** Every route here requires ADMIN or SUPER_ADMIN (class level); `@Roles('SUPER_ADMIN')` on a method tightens it. Enforced server-side, never by the UI. */
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminController {
  constructor(private svc: AdminService, private ai: AiMonitorService) {}
  @Get('overview') overview() { return this.svc.overview(); }
  @Get('users') users(@page() p: number, @Query('q') q?: string, @Query('status') s?: string, @Query('role') r?: string) { return this.svc.users(p, q?.slice(0, 100), s, r); }
  @Get('users/:id') user(@uuid('id') id: string) { return this.svc.userDetail(id); }
  @Post('users/:id/suspend') suspend(@CurrentUser() a: AuthUser, @uuid('id') id: string, @Body() b: unknown) { return this.svc.setSuspended(a, id, true, parse(reasonSchema, b).reason); }
  @Post('users/:id/reactivate') reactivate(@CurrentUser() a: AuthUser, @uuid('id') id: string) { return this.svc.setSuspended(a, id, false); }
  @Put('users/:id/role') @Roles('SUPER_ADMIN') updateRole(@CurrentUser() a: AuthUser, @uuid('id') id: string, @Body() b: unknown) { return this.svc.setRole(a, id, parse(roleSchema, b).role); }
  @Get('subscriptions') subs(@page() p: number, @Query('status') s?: string) { return this.svc.subscriptions(p, s); }
  @Get('payments') payments(@page() p: number, @Query('status') s?: string) { return this.svc.payments(p, s); }
  @Get('plans') plans() { return this.svc.plans(); }
  @Put('plans/:code') @Roles('SUPER_ADMIN') updatePlan(@CurrentUser() a: AuthUser, @Param('code') code: string, @Body() b: unknown) { return this.svc.updatePlan(a, parse(planCodeSchema, code), parse(planUpdateSchema, b)); }
  @Get('settings/pricing') pricing() { return this.svc.pricing(); }
  @Put('settings/pricing') @Roles('SUPER_ADMIN') setPricing(@CurrentUser() a: AuthUser, @Body() b: unknown) { return this.svc.setPricing(a, parse(pricingSchema, b)); }
  @Get('ai') aiUsage(@Query('days', new DefaultValuePipe(7), ParseIntPipe) d: number) { return this.ai.ai(Math.min(90, Math.max(1, d))); }
  @Get('health') health() { return this.ai.health(); }
  @Get('tickets') tickets(@page() p: number, @Query('status') s?: string) { return this.svc.tickets(p, s); }
  @Patch('tickets/:id') ticket(@CurrentUser() a: AuthUser, @uuid('id') id: string, @Body() b: unknown) { return this.svc.updateTicket(a, id, parse(ticketUpdateSchema, b)); }
  @Get('announcements') ann() { return this.svc.announcements(); }
  @Post('announcements') @UseInterceptors(IdempotencyInterceptor) annCreate(@CurrentUser() a: AuthUser, @Body() b: unknown) { return this.svc.createAnnouncement(a, parse(announcementSchema, b)); }
  @Patch('announcements/:id') annToggle(@CurrentUser() a: AuthUser, @uuid('id') id: string, @Body() b: unknown) { return this.svc.setAnnouncementActive(a, id, parse(z.object({ active: z.boolean() }), b).active); }
  @Delete('announcements/:id') annDelete(@CurrentUser() a: AuthUser, @uuid('id') id: string) { return this.svc.removeAnnouncement(a, id); }
  @Get('analytics') analytics(@Query('days', new DefaultValuePipe(30), ParseIntPipe) d: number) { return this.svc.analytics(Math.min(180, Math.max(7, d))); }
  @Post('payments/:id/refund') @Roles('SUPER_ADMIN') refund(@CurrentUser() a: AuthUser, @uuid('id') id: string) { return this.svc.refundPayment(a, id); }
  @Get('audit') audit(@page() p: number, @Query('action') action?: string) { return this.svc.auditLogs(p, action); }
}

/** Authenticated end-user endpoints (the web app uses /me only to decide what to show; the backend still enforces roles). */
@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class AccountController {
  constructor(private svc: AdminService) {}
  @Get('me') me(@CurrentUser() u: AuthUser) { return u; }
  @Get('announcements') announcements() { return this.svc.activeAnnouncements(); }
  @Post('support') @UseInterceptors(IdempotencyInterceptor) @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) support(@CurrentUser() u: AuthUser, @Body() b: unknown) { const x = parse(supportSchema, b); return this.svc.createTicket(u.id, x.subject, x.body); }
  @Get('support') mySupport(@CurrentUser() u: AuthUser) { return this.svc.myTickets(u.id); }
}
