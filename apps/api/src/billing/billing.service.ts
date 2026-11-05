import { CacheService } from '../common/cache';
import { BadRequestException, ConflictException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '@justiceview/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeGateway } from './stripe.gateway';
import { UsageService } from './usage.service';

type Status = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING';
export function mapStatus(s: string): Status | null {
  switch (s) { case 'active': return 'ACTIVE'; case 'trialing': return 'TRIALING'; case 'past_due': return 'PAST_DUE';
    case 'canceled': case 'unpaid': case 'incomplete_expired': return 'CANCELED'; default: return null; } // 'incomplete' grants nothing
}
/** Newer Stripe API versions moved current_period_end onto the subscription item. */
export function periodEnd(sub: any): Date | null { const t = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end; return t ? new Date(t * 1000) : null; }
export function planForPrice(plans: { id: string; stripePriceMonthly: string | null; stripePriceAnnual: string | null }[], priceId?: string) {
  if (!priceId) return null;
  for (const p of plans) { if (p.stripePriceMonthly === priceId) return { plan: p, interval: 'monthly' }; if (p.stripePriceAnnual === priceId) return { plan: p, interval: 'annual' }; }
  return null;
}
const custId = (c: unknown) => (typeof c === 'string' ? c : (c as { id?: string } | null)?.id);
// Stripe payload objects are deliberately typed `any`: shapes differ across API versions and we read only a few fields.
/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class BillingService {
  private log = new Logger('Billing');
  constructor(private prisma: PrismaService, private stripe: StripeGateway, private notifications: NotificationsService, private usage: UsageService, @Optional() private cache?: CacheService) {}

  async plans() {
    const rows = this.cache ? await this.cache.wrap('plans:all', 60, () => this.prisma.plan.findMany()) : await this.prisma.plan.findMany();
    const rank = ['free', 'pro', 'premium'];
    return rows.sort((a, b) => rank.indexOf(a.code) - rank.indexOf(b.code)).map((p) => ({ code: p.code, name: p.name, limits: p.limits, currency: p.currency,
      priceMonthlyCents: p.priceMonthlyCents, priceAnnualCents: p.priceAnnualCents, monthlyAvailable: !!p.stripePriceMonthly, annualAvailable: !!p.stripePriceAnnual }));
  }
  me(userId: string) { return this.usage.summary(userId); }
  payments(userId: string) { return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }

  async checkout(userId: string, planCode: 'pro' | 'premium', interval: 'monthly' | 'annual') {
    const active = await this.prisma.subscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, select: { id: true } });
    if (active) throw new ConflictException('You already have a subscription. Use the billing portal to change or cancel it.');
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    const priceId = interval === 'annual' ? plan?.stripePriceAnnual : plan?.stripePriceMonthly;
    if (!plan || !priceId) throw new ServiceUnavailableException('This plan is not available for purchase yet');
    const user = await this.prisma.user.findUnique({ where: { id: userId } }); if (!user) throw new BadRequestException('Unknown user');
    let customerId = user.stripeCustomerId;
    if (!customerId) { customerId = await this.stripe.createCustomer(user.email, userId); await this.prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } }); }
    const f = loadEnv().FRONTEND_URL;
    return { url: await this.stripe.checkoutUrl({ customerId, priceId, userId, successUrl: `${f}/billing?status=success`, cancelUrl: `${f}/billing?status=cancelled`,
      idempotencyKey: `checkout:${userId}:${planCode}:${interval}:${Math.floor(Date.now() / 3_600_000)}` }) }; // retries within the hour reuse the same session
  }
  async portal(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    if (!u?.stripeCustomerId) throw new ConflictException('No billing account yet');
    return { url: await this.stripe.portalUrl(u.stripeCustomerId, `${loadEnv().FRONTEND_URL}/billing`) };
  }

  /** Signature-verified, idempotent (by Stripe event id). A failed handler un-records the event so Stripe's retry reprocesses it. */
  async webhook(raw: Buffer | undefined, signature: string | undefined) {
    if (!raw || !signature) throw new BadRequestException('Missing signature');
    let ev: any; try { ev = this.stripe.constructEvent(raw, signature); } catch (e) { if (e instanceof ServiceUnavailableException) throw e; throw new BadRequestException('Invalid signature'); }
    try { await this.prisma.stripeEvent.create({ data: { id: ev.id } }); } catch (e) { if ((e as { code?: string }).code === 'P2002') return { received: true, duplicate: true }; throw e; }
    try { await this.handle(ev); } catch (e) { await this.prisma.stripeEvent.delete({ where: { id: ev.id } }).catch(() => undefined); throw e; }
    return { received: true };
  }
  private async handle(ev: any) {
    const o = ev.data.object;
    switch (ev.type) {
      case 'checkout.session.completed': {
        const cid = custId(o.customer); if (o.client_reference_id && cid) await this.prisma.user.updateMany({ where: { id: o.client_reference_id, stripeCustomerId: null }, data: { stripeCustomerId: cid } }); break; }
      case 'customer.subscription.created': case 'customer.subscription.updated': await this.syncSubscription(o); break;
      case 'customer.subscription.deleted': {
        const row = await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: o.id } });
        await this.prisma.subscription.updateMany({ where: { stripeSubscriptionId: o.id }, data: { status: 'CANCELED' } });
        if (row) await this.notifications.notify(row.userId, 'subscription_canceled', 'Subscription ended', 'Your JusticeView subscription has ended. You are now on the Free plan.', { email: true }); break; }
      case 'invoice.paid': await this.recordInvoice(o, 'paid'); break;
      case 'invoice.payment_failed': {
        const uid = await this.recordInvoice(o, 'failed');
        if (uid) await this.notifications.notify(uid, 'payment_failed', 'Payment failed', 'We could not process your latest payment. Please update your payment method in the billing portal to keep your plan.', { email: true }); break; }
      case 'charge.refunded': if (o.invoice) await this.prisma.payment.updateMany({ where: { stripeInvoiceId: String(o.invoice) }, data: { status: o.refunded ? 'refunded' : 'paid' } }); break; // refunds made in the Stripe dashboard
      default: break; // unhandled events are acknowledged
    }
  }
  private async userByCustomer(customer: unknown) {
    const id = custId(customer); return id ? this.prisma.user.findUnique({ where: { stripeCustomerId: id }, select: { id: true } }) : null;
  }
  private async syncSubscription(sub: any) {
    const status = mapStatus(sub.status); if (!status) return;
    const match = planForPrice(await this.prisma.plan.findMany(), sub.items?.data?.[0]?.price?.id);
    if (!match) { this.log.warn(`subscription ${sub.id}: unknown price, not granting access`); return; }
    const userId: string | undefined = sub.metadata?.userId ?? (await this.userByCustomer(sub.customer))?.id; if (!userId) { this.log.warn(`subscription ${sub.id}: no user`); return; }
    const existing = await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
    const data = { userId, planId: match.plan.id, status, interval: match.interval, currentPeriodEnd: periodEnd(sub), cancelAtPeriodEnd: !!sub.cancel_at_period_end };
    await this.prisma.subscription.upsert({ where: { stripeSubscriptionId: sub.id }, create: { ...data, stripeSubscriptionId: sub.id }, update: data });
    if (!existing && (status === 'ACTIVE' || status === 'TRIALING'))
      await this.notifications.notify(userId, 'subscription_confirmed', 'Subscription confirmed', 'Thanks for subscribing to JusticeView. Your plan is now active.', { email: true });
  }
  private async recordInvoice(inv: any, status: 'paid' | 'failed'): Promise<string | null> {
    const u = await this.userByCustomer(inv.customer); if (!u) return null;
    const data = { userId: u.id, amount: status === 'paid' ? (inv.amount_paid ?? 0) : (inv.amount_due ?? 0), currency: inv.currency ?? 'usd', status, hostedInvoiceUrl: inv.hosted_invoice_url ?? null, invoicePdf: inv.invoice_pdf ?? null };
    await this.prisma.payment.upsert({ where: { stripeInvoiceId: inv.id }, create: { ...data, stripeInvoiceId: inv.id }, update: data }); return u.id;
  }
}
