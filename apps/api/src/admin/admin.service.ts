import { Prisma } from '@prisma/client';
import { CacheService } from '../common/cache';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeGateway } from '../billing/stripe.gateway';
import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeBus } from '../realtime/realtime.bus';
import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { UsageService } from '../billing/usage.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { assertCanModerate, Actor } from './rbac';
import { announcementSchema, planUpdateSchema, Pricing, pricingSchema, ticketUpdateSchema } from './admin.schemas';

const PAGE = 25; const skip = (p: number) => (Math.max(1, p) - 1) * PAGE;
const ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN'];

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService, private usage: UsageService, @Optional() private bus?: RealtimeBus, @Optional() private notifications?: NotificationsService, @Optional() private cache?: CacheService, @Optional() private stripe?: StripeGateway) {}

  async overview() {
    const d7 = new Date(Date.now() - 7 * 864e5), d1 = new Date(Date.now() - 864e5);
    const [users, newUsers, suspended, subs, sessions, ai24, aiFail24, openTickets] = await Promise.all([
      this.prisma.user.count(), this.prisma.user.count({ where: { createdAt: { gte: d7 } } }), this.prisma.user.count({ where: { suspended: true } }),
      this.prisma.subscription.groupBy({ by: ['planId'], where: { status: { in: ['ACTIVE', 'TRIALING'] } }, _count: { _all: true } }),
      this.prisma.interviewSession.count({ where: { createdAt: { gte: d7 } } }), this.prisma.aiRequestLog.count({ where: { createdAt: { gte: d1 } } }),
      this.prisma.aiRequestLog.count({ where: { createdAt: { gte: d1 }, status: 'error' } }), this.prisma.supportTicket.count({ where: { status: { not: 'CLOSED' } } })]);
    const plans = await this.prisma.plan.findMany({ select: { id: true, name: true } });
    return { users, newUsers7d: newUsers, suspended, activeSubscriptions: subs.map((s) => ({ plan: plans.find((p) => p.id === s.planId)?.name ?? '?', count: s._count._all })),
      sessions7d: sessions, aiRequests24h: ai24, aiFailures24h: aiFail24, openTickets };
  }

  async users(page: number, q?: string, status?: string, role?: string) {
    const where = { ...(q ? { email: { contains: q, mode: 'insensitive' as const } } : {}), ...(status === 'suspended' ? { suspended: true } : status === 'active' ? { suspended: false } : {}),
      ...(role && ROLES.includes(role) ? { roles: { some: { role: { name: role as never } } } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: PAGE, select: { id: true, email: true, suspended: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } }, subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] } }, take: 1, select: { plan: { select: { name: true } } } } } }),
      this.prisma.user.count({ where })]);
    return { total, page, pageSize: PAGE, items: rows.map((u) => ({ id: u.id, email: u.email, suspended: u.suspended, createdAt: u.createdAt, roles: u.roles.map((r) => r.role.name), plan: u.subscriptions[0]?.plan.name ?? 'Free' })) };
  }

  /** Account metadata only: admins cannot read transcripts, resumes or answers through this API. */
  async userDetail(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { profile: { select: { fullName: true, title: true, onboardedAt: true } }, roles: { select: { role: { select: { name: true } } } }, subscriptions: { orderBy: { createdAt: 'desc' }, take: 5, include: { plan: { select: { name: true } } } } } });
    if (!u) throw new NotFoundException('User not found');
    const [sessions, resumes, mocks, usage, history] = await Promise.all([this.prisma.interviewSession.count({ where: { userId: id } }), this.prisma.resume.count({ where: { userId: id } }),
      this.prisma.mockInterview.count({ where: { userId: id } }), this.usage.summary(id), this.prisma.auditLog.findMany({ where: { target: `user:${id}` }, orderBy: { createdAt: 'desc' }, take: 10 })]);
    return { id: u.id, email: u.email, suspended: u.suspended, createdAt: u.createdAt, profile: u.profile, roles: u.roles.map((r) => r.role.name), subscriptions: u.subscriptions, counts: { sessions, resumes, mocks }, usage, history };
  }

  private async target(id: string): Promise<{ id: string; roles: string[] }> {
    const t = await this.prisma.user.findUnique({ where: { id }, select: { id: true, roles: { select: { role: { select: { name: true } } } } } });
    if (!t) throw new NotFoundException('User not found'); return { id: t.id, roles: t.roles.map((r) => r.role.name) };
  }
  async setSuspended(actor: Actor, id: string, suspended: boolean, reason?: string) {
    assertCanModerate(actor, await this.target(id));
    await this.prisma.user.update({ where: { id }, data: { suspended } });
    if (suspended) { // cut off access immediately: revoke every login session and close open sockets
      await this.prisma.userSession?.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }); this.bus?.disconnectUser(id);
    }
    await this.audit.log(actor.id, suspended ? 'user.suspend' : 'user.reactivate', `user:${id}`, { reason }); return { ok: true };
  }
  async setRole(actor: Actor, id: string, role: 'USER' | 'ADMIN') {
    if (!actor.roles.includes('SUPER_ADMIN')) throw new ForbiddenException('Super Admin only');
    assertCanModerate(actor, await this.target(id));
    if (role === 'ADMIN') { const r = await this.prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
      await this.prisma.userRole.upsert({ where: { userId_roleId: { userId: id, roleId: r.id } }, update: {}, create: { userId: id, roleId: r.id } }); }
    else await this.prisma.userRole.deleteMany({ where: { userId: id, role: { name: 'ADMIN' } } });
    await this.audit.log(actor.id, 'user.role', `user:${id}`, { role }); return { ok: true };
  }

  async subscriptions(page: number, status?: string) {
    const where = status && ['ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING'].includes(status) ? { status: status as never } : {};
    const [items, total] = await Promise.all([this.prisma.subscription.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: PAGE, include: { plan: { select: { name: true } }, user: { select: { email: true } } } }), this.prisma.subscription.count({ where })]);
    return { items, total, page, pageSize: PAGE };
  }
  async payments(page: number, status?: string) {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: PAGE, include: { user: { select: { email: true } } } }), this.prisma.payment.count({ where })]);
    return { items, total, page, pageSize: PAGE };
  }
  plans() { return this.prisma.plan.findMany(); }
  async updatePlan(actor: Actor, code: string, input: z.infer<typeof planUpdateSchema>) {
    const before = await this.prisma.plan.findUnique({ where: { code } }); if (!before) throw new NotFoundException('Plan not found');
    const after = await this.prisma.plan.update({ where: { code }, data: input as never });
    await this.cache?.del('plans:all', 'plan:free'); // pricing page and limit checks must see the change immediately
    await this.audit.log(actor.id, 'plan.update', `plan:${code}`, { before, after }); return after;
  }
  async pricing(): Promise<Pricing> { const r = await this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } }); return pricingSchema.parse(r?.value ?? {}); }
  async setPricing(actor: Actor, input: Pricing) {
    const before = await this.pricing();
    await this.prisma.platformSetting.upsert({ where: { key: 'pricing' }, update: { value: input }, create: { key: 'pricing', value: input } });
    await this.audit.log(actor.id, 'settings.pricing', 'settings:pricing', { before, after: input }); return input;
  }

  /** Refunds the full payment (Super Admin). Marks it refunded only after Stripe accepts. */
  async refundPayment(actor: Actor, paymentId: string) {
    const pay = await this.prisma.payment.findUnique({ where: { id: paymentId } }); if (!pay) throw new NotFoundException('Payment not found');
    if (pay.status !== 'paid') throw new ConflictException(`Only paid invoices can be refunded (this one is ${pay.status})`);
    if (!this.stripe) throw new ConflictException('Billing is not wired'); await this.stripe.refundInvoice(pay.stripeInvoiceId);
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'refunded' } });
    await this.audit.log(actor.id, 'payment.refund', `payment:${paymentId}`, { amount: pay.amount, currency: pay.currency });
    await this.notifications?.notify(pay.userId, 'refund', 'Refund issued', 'A refund for your latest payment has been issued; it can take a few days to appear.', { email: true }); return { ok: true };
  }

  /** Platform-wide trends from stored rows only. */
  async analytics(days = 30) {
    const since = new Date(Date.now() - days * 864e5);
    const [signups, sessions, usage, revenue, plans, mocks] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; count: number }[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<{ day: Date; count: number }[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count FROM "InterviewSession" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`),
      this.prisma.usageRecord.groupBy({ by: ['metric'], where: { createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.payment.groupBy({ by: ['currency', 'status'], where: { createdAt: { gte: since } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.subscription.groupBy({ by: ['planId'], where: { status: { in: ['ACTIVE', 'TRIALING'] } }, _count: { _all: true } }),
      this.prisma.mockInterview.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: since } }, _count: { _all: true }, _avg: { overallScore: true } })]);
    const names = await this.prisma.plan.findMany({ select: { id: true, name: true } }); const day = (r: { day: Date; count: number }) => ({ day: r.day.toISOString().slice(0, 10), count: r.count });
    return { days, signups: signups.map(day), sessions: sessions.map(day), usage: usage.map((u) => ({ metric: u.metric, total: Math.round((u._sum.quantity ?? 0) * 10) / 10 })),
      revenue: revenue.map((r) => ({ currency: r.currency, status: r.status, amountMinor: r._sum.amount ?? 0, count: r._count._all })), plans: plans.map((p) => ({ plan: names.find((n) => n.id === p.planId)?.name ?? '?', count: p._count._all })),
      mocks: { completed: mocks._count._all, avgScore: mocks._avg.overallScore === null ? null : Math.round((mocks._avg.overallScore as number) * 10) / 10 } };
  }

  async tickets(page: number, status?: string) {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([this.prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: PAGE, include: { user: { select: { email: true } } } }), this.prisma.supportTicket.count({ where })]);
    return { items, total, page, pageSize: PAGE };
  }
  async updateTicket(actor: Actor, id: string, input: z.infer<typeof ticketUpdateSchema>) {
    const { count } = await this.prisma.supportTicket.updateMany({ where: { id }, data: input }); if (!count) throw new NotFoundException('Ticket not found');
    await this.audit.log(actor.id, 'ticket.update', `ticket:${id}`, { status: input.status });
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, select: { userId: true, subject: true } });
    if (t && (input.adminNote || input.status === 'CLOSED')) await this.notifications?.notify(t.userId, 'support_reply', `Update on: ${t.subject.slice(0, 80)}`, input.adminNote || 'Your support request has been closed.', { email: true });
    return { ok: true };
  }
  announcements() { return this.prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  async createAnnouncement(actor: Actor, input: z.infer<typeof announcementSchema>) {
    const a = await this.prisma.announcement.create({ data: { title: input.title, body: input.body, createdBy: actor.id, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } });
    await this.audit.log(actor.id, 'announcement.create', `announcement:${a.id}`); return a;
  }
  async setAnnouncementActive(actor: Actor, id: string, active: boolean) {
    const { count } = await this.prisma.announcement.updateMany({ where: { id }, data: { active } }); if (!count) throw new NotFoundException('Not found');
    await this.audit.log(actor.id, active ? 'announcement.enable' : 'announcement.disable', `announcement:${id}`); return { ok: true };
  }
  async removeAnnouncement(actor: Actor, id: string) {
    const { count } = await this.prisma.announcement.deleteMany({ where: { id } }); if (!count) throw new NotFoundException('Not found');
    await this.audit.log(actor.id, 'announcement.delete', `announcement:${id}`); return { ok: true };
  }
  async auditLogs(page: number, action?: string) {
    const where = action ? { action: { contains: action.slice(0, 40) } } : {};
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: PAGE, include: { actor: { select: { email: true } } } }), this.prisma.auditLog.count({ where })]);
    return { items, total, page, pageSize: PAGE };
  }
  // ---- end-user facing
  activeAnnouncements() { const now = new Date(); return this.prisma.announcement.findMany({ where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, body: true } }); }
  createTicket(userId: string, subject: string, body: string) { return this.prisma.supportTicket.create({ data: { userId, subject, body } }); }
  myTickets(userId: string) { return this.prisma.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, subject: true, status: true, adminNote: true, createdAt: true } }); }
}
