import { IdempotencyInterceptor } from '../common/idempotency';
import { Body, Controller, Get, Headers, Post, RawBodyRequest, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { parse } from '../common/parse';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService) {}
  @Get('plans') plans() { return this.svc.plans(); } // public (pricing page)
  @Get('me') @UseGuards(AuthGuard, RolesGuard) me(@CurrentUser() u: AuthUser) { return this.svc.me(u.id); }
  @Get('payments') @UseGuards(AuthGuard, RolesGuard) payments(@CurrentUser() u: AuthUser) { return this.svc.payments(u.id); }
  @Post('checkout') @UseGuards(AuthGuard, RolesGuard) @UseInterceptors(IdempotencyInterceptor) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const x = parse(z.object({ plan: z.enum(['pro', 'premium']), interval: z.enum(['monthly', 'annual']) }), b); return this.svc.checkout(u.id, x.plan, x.interval);
  }
  @Post('portal') @UseGuards(AuthGuard, RolesGuard) portal(@CurrentUser() u: AuthUser) { return this.svc.portal(u.id); }
  /** Unauthenticated by design: authenticity comes from the Stripe signature over the raw body. */
  @Post('webhook') @SkipThrottle()
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig?: string) { return this.svc.webhook(req.rawBody, sig); }
}
