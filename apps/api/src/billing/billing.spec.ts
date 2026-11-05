import { BadRequestException, ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { BillingService, mapStatus, periodEnd, planForPrice } from './billing.service';
import { monthStart, UsageService } from './usage.service';
import { Mailer, NotificationsService } from '../notifications/notifications.service';

beforeEach(() => Object.assign(process.env, { DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32), FRONTEND_URL: 'http://f.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r' }));

describe('pure helpers', () => {
  it('mapStatus', () => { expect(mapStatus('active')).toBe('ACTIVE'); expect(mapStatus('past_due')).toBe('PAST_DUE'); expect(mapStatus('unpaid')).toBe('CANCELED'); expect(mapStatus('incomplete')).toBeNull(); });
  it('periodEnd supports both API shapes', () => { expect(periodEnd({ current_period_end: 100 })?.getTime()).toBe(100000); expect(periodEnd({ items: { data: [{ current_period_end: 200 }] } })?.getTime()).toBe(200000); expect(periodEnd({})).toBeNull(); });
  it('planForPrice', () => { const ps = [{ id: 'p', stripePriceMonthly: 'm', stripePriceAnnual: 'a' }]; expect(planForPrice(ps, 'a')).toEqual({ plan: ps[0], interval: 'annual' }); expect(planForPrice(ps, 'zzz')).toBeNull(); expect(planForPrice(ps)).toBeNull(); });
  it('monthStart is the first of the month UTC', () => expect(monthStart(new Date('2026-10-31T23:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z'));
});

describe('UsageService', () => {
  const mk = (limits: any, used: number, sub: any = null, warned = false) => {
    const p: any = { subscription: { findFirst: jest.fn(async () => sub) }, plan: { findUnique: jest.fn(async () => ({ code: 'free', name: 'Free', limits })) },
      usageRecord: { aggregate: jest.fn(async () => ({ _sum: { quantity: used } })), create: jest.fn() }, notification: { findFirst: jest.fn(async () => (warned ? { id: 'n' } : null)) } };
    const n: any = { notify: jest.fn() }; return { p, n, svc: new UsageService(p, n) };
  };
  it('allows usage under the limit and never blocks unlimited plans', async () => { await mk({ aiRequests: 10 }, 3).svc.assertWithin('u', 'aiRequests'); await mk({ aiRequests: -1 }, 99999).svc.assertWithin('u', 'aiRequests'); });
  it('throws 402 with details at the limit', async () => {
    const e: any = await mk({ aiRequests: 10 }, 10).svc.assertWithin('u', 'aiRequests').catch((x) => x);
    expect(e).toBeInstanceOf(HttpException); expect(e.getStatus()).toBe(402); expect(e.getResponse()).toMatchObject({ code: 'LIMIT_REACHED', metric: 'aiRequests', limit: 10, used: 10 });
  });
  it('fails closed on unknown metrics', async () => { await expect(mk({ aiRequests: 10 }, 0).svc.assertWithin('u', 'mystery')).rejects.toMatchObject({ status: 402 }); });
  it('uses the active subscription plan over Free', async () => {
    const { svc, p } = mk({ aiRequests: 1 }, 5, { plan: { code: 'pro', name: 'Pro', limits: { aiRequests: 500 } } }); await svc.assertWithin('u', 'aiRequests'); expect(p.plan.findUnique).not.toHaveBeenCalled();
  });
  it('only counts the current calendar month', async () => { const { p, svc } = mk({ aiRequests: 10 }, 0); await svc.assertWithin('u', 'aiRequests'); expect(p.usageRecord.aggregate.mock.calls[0][0].where.createdAt.gte).toEqual(monthStart()); });
  it('warns once at 80% and not again', async () => {
    const a = mk({ aiRequests: 10 }, 7); await a.svc.assertWithin('u', 'aiRequests'); expect(a.n.notify).toHaveBeenCalledWith('u', 'usage_warning', expect.any(String), expect.any(String), { email: true });
    const b = mk({ aiRequests: 10 }, 7, null, true); await b.svc.assertWithin('u', 'aiRequests'); expect(b.n.notify).not.toHaveBeenCalled();
    const c = mk({ aiRequests: 10 }, 2); await c.svc.assertWithin('u', 'aiRequests'); expect(c.n.notify).not.toHaveBeenCalled();
  });
  it('fails clearly when plans are not seeded', async () => { const { p, svc } = mk({}, 0); p.plan.findUnique.mockResolvedValue(null); await expect(svc.assertWithin('u', 'aiRequests')).rejects.toThrow(ServiceUnavailableException); });
});

describe('BillingService', () => {
  const plans = [{ id: 'pl-pro', code: 'pro', stripePriceMonthly: 'price_m', stripePriceAnnual: 'price_a' }];
  const mk = (over: any = {}) => {
    const p: any = { plan: { findMany: jest.fn(async () => plans), findUnique: jest.fn(async ({ where }: any) => plans.find((x) => x.code === where.code) ?? null) },
      subscription: { findFirst: jest.fn(async () => over.active ?? null), findUnique: jest.fn(async () => over.existingSub ?? null), upsert: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn(async ({ where }: any) => (where.stripeCustomerId ? (over.byCustomer === null ? null : { id: 'u1' }) : { id: 'u1', email: 'a@b.co', stripeCustomerId: over.customer ?? null })), update: jest.fn(), updateMany: jest.fn() },
      stripeEvent: { create: jest.fn(async () => { if (over.dupEvent) throw Object.assign(new Error('d'), { code: 'P2002' }); }), delete: jest.fn(async () => ({})) },
      payment: { upsert: jest.fn(), findMany: jest.fn() } };
    const stripe: any = { constructEvent: jest.fn((raw: any, sig: string) => { if (sig === 'bad') throw new Error('sig'); return over.event; }), createCustomer: jest.fn(async () => 'cus_1'), checkoutUrl: jest.fn(async () => 'https://stripe/checkout'), portalUrl: jest.fn(async () => 'https://stripe/portal') };
    const n: any = { notify: jest.fn() }; return { p, stripe, n, svc: new BillingService(p, stripe, n, {} as any) };
  };
  const subEvent = (type: string, extra: any = {}) => ({ id: 'evt_1', type, data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { userId: 'u1' }, cancel_at_period_end: false, current_period_end: 1000, items: { data: [{ price: { id: 'price_a' } }] }, ...extra } } });
  const hook = (svc: BillingService) => svc.webhook(Buffer.from('{}'), 'sig');

  it('rejects missing/invalid signatures with 400 and writes nothing', async () => {
    const { svc, p } = mk(); await expect(svc.webhook(undefined, 'x')).rejects.toThrow(BadRequestException); await expect(svc.webhook(Buffer.from('{}'), 'bad')).rejects.toThrow(BadRequestException); expect(p.stripeEvent.create).not.toHaveBeenCalled();
  });
  it('is idempotent per event id', async () => { const { svc, p } = mk({ event: subEvent('customer.subscription.updated'), dupEvent: true }); expect(await hook(svc)).toEqual({ received: true, duplicate: true }); expect(p.subscription.upsert).not.toHaveBeenCalled(); });
  it('syncs a subscription to the matching plan/interval and confirms new subscribers', async () => {
    const { svc, p, n } = mk({ event: subEvent('customer.subscription.created') }); await hook(svc);
    expect(p.subscription.upsert.mock.calls[0][0].create).toMatchObject({ userId: 'u1', planId: 'pl-pro', status: 'ACTIVE', interval: 'annual', stripeSubscriptionId: 'sub_1' }); expect(n.notify).toHaveBeenCalledWith('u1', 'subscription_confirmed', expect.any(String), expect.any(String), { email: true });
  });
  it('does not re-confirm on updates and records cancel-at-period-end', async () => {
    const { svc, p, n } = mk({ event: subEvent('customer.subscription.updated', { cancel_at_period_end: true }), existingSub: { userId: 'u1' } }); await hook(svc);
    expect(n.notify).not.toHaveBeenCalled(); expect(p.subscription.upsert.mock.calls[0][0].update.cancelAtPeriodEnd).toBe(true);
  });
  it('grants nothing for unknown prices or incomplete subscriptions', async () => {
    const a = mk({ event: subEvent('customer.subscription.created', { items: { data: [{ price: { id: 'price_unknown' } }] } }) }); await hook(a.svc); expect(a.p.subscription.upsert).not.toHaveBeenCalled();
    const b = mk({ event: subEvent('customer.subscription.created', { status: 'incomplete' }) }); await hook(b.svc); expect(b.p.subscription.upsert).not.toHaveBeenCalled();
  });
  it('cancels on subscription.deleted', async () => { const { svc, p, n } = mk({ event: subEvent('customer.subscription.deleted'), existingSub: { userId: 'u1' } }); await hook(svc); expect(p.subscription.updateMany.mock.calls[0][0].data.status).toBe('CANCELED'); expect(n.notify).toHaveBeenCalled(); });
  it('records failed payments and notifies', async () => {
    const { svc, p, n } = mk({ event: { id: 'e2', type: 'invoice.payment_failed', data: { object: { id: 'in_1', customer: 'cus_1', amount_due: 1500, currency: 'usd' } } } }); await hook(svc);
    expect(p.payment.upsert.mock.calls[0][0].create).toMatchObject({ stripeInvoiceId: 'in_1', status: 'failed', amount: 1500 }); expect(n.notify).toHaveBeenCalledWith('u1', 'payment_failed', expect.any(String), expect.any(String), { email: true });
  });
  it('records paid invoices', async () => { const { svc, p } = mk({ event: { id: 'e3', type: 'invoice.paid', data: { object: { id: 'in_2', customer: 'cus_1', amount_paid: 900, currency: 'usd', hosted_invoice_url: 'https://i' } } } }); await hook(svc); expect(p.payment.upsert.mock.calls[0][0].create).toMatchObject({ status: 'paid', amount: 900, hostedInvoiceUrl: 'https://i' }); });
  it('un-records the event when a handler fails so Stripe retries', async () => {
    const { svc, p } = mk({ event: subEvent('customer.subscription.created') }); p.subscription.upsert.mockRejectedValue(new Error('db down'));
    await expect(hook(svc)).rejects.toThrow('db down'); expect(p.stripeEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt_1' } });
  });
  it('checkout: refuses duplicates, creates customer once, uses an idempotency key and fixed redirect URLs', async () => {
    await expect(mk({ active: { id: 's' } }).svc.checkout('u1', 'pro', 'monthly')).rejects.toThrow(ConflictException);
    const { svc, stripe, p } = mk(); const r = await svc.checkout('u1', 'pro', 'annual');
    expect(r.url).toBe('https://stripe/checkout'); expect(stripe.createCustomer).toHaveBeenCalledWith('a@b.co', 'u1'); expect(p.user.update).toHaveBeenCalled();
    expect(stripe.checkoutUrl.mock.calls[0][0]).toMatchObject({ priceId: 'price_a', userId: 'u1', successUrl: 'http://f.co/billing?status=success', idempotencyKey: expect.stringMatching(/^checkout:u1:pro:annual:\d+$/) });
  });
  it('checkout: 503 when the plan has no Stripe price; portal needs a customer', async () => {
    const m = mk(); m.p.plan.findUnique.mockResolvedValue({ id: 'x', stripePriceMonthly: null, stripePriceAnnual: null }); await expect(m.svc.checkout('u1', 'pro', 'monthly')).rejects.toThrow(ServiceUnavailableException);
    await expect(mk().svc.portal('u1')).rejects.toThrow(ConflictException); expect((await mk({ customer: 'cus_1' }).svc.portal('u1')).url).toBe('https://stripe/portal');
  });
});

describe('NotificationsService / Mailer', () => {
  const mk = () => { const p: any = { notification: { create: jest.fn(async ({ data }: any) => data) }, user: { findUnique: jest.fn(async () => ({ email: 'a@b.co' })) } }; const mailer = new Mailer(); return { p, mailer, svc: new NotificationsService(p, mailer) }; };
  afterEach(() => { delete process.env.RESEND_API_KEY; });
  it('always stores the in-app notification, skips email when Resend is unconfigured', async () => { const { svc, p } = mk(); const spy = jest.spyOn(Mailer.prototype, 'send'); await svc.notify('u', 't', 'Title', 'Body', { email: true }); expect(p.notification.create).toHaveBeenCalled(); expect(await new Mailer().send('a@b.co', 's', 't')).toBe(false); spy.mockRestore(); });
  it('sends via Resend with the server key and escapes HTML', async () => {
    process.env.RESEND_API_KEY = 're_x'; const f = jest.fn(async () => ({ ok: true })); (global as any).fetch = f;
    expect(await new Mailer().send('a@b.co', 'Hi', '<script>x</script>')).toBe(true); const [, init] = f.mock.calls[0] as any;
    expect(init.headers.Authorization).toBe('Bearer re_x'); const b = JSON.parse(init.body); expect(b.to).toEqual(['a@b.co']); expect(b.html).not.toContain('<script>');
  });
  it('never throws when the email provider fails', async () => { process.env.RESEND_API_KEY = 're_x'; (global as any).fetch = jest.fn(async () => { throw new Error('net'); }); expect(await new Mailer().send('a@b.co', 's', 't')).toBe(false); });
});
