import { CacheService } from '../common/cache';
import { HttpException, HttpStatus, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Server-side plan limits (calendar month, UTC). The frontend never decides entitlement. Limits live in the Plan table; -1 = unlimited. */
@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, @Optional() private cache?: CacheService) {}

  async planFor(userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, include: { plan: true } });
    if (sub) return { plan: sub.plan, sub };
    const load = () => this.prisma.plan.findUnique({ where: { code: 'free' } });
    const free = this.cache ? await this.cache.wrap('plan:free', 60, load) : await load();
    if (!free) throw new ServiceUnavailableException('Plans are not configured (run the seed)');
    return { plan: free, sub: null };
  }
  async used(userId: string, metric: string, now = new Date()) {
    const r = await this.prisma.usageRecord.aggregate({ where: { userId, metric, createdAt: { gte: monthStart(now) } }, _sum: { quantity: true } }); return r._sum.quantity ?? 0;
  }
  /** Throws 402 if `amount` more units would exceed the plan limit. Unknown metrics fail closed. */
  async assertWithin(userId: string, metric: string, amount = 1) {
    const { plan } = await this.planFor(userId); const limit = (plan.limits as Record<string, unknown>)[metric];
    const used = await this.used(userId, metric);
    if (typeof limit !== 'number') throw new HttpException({ statusCode: 402, code: 'LIMIT_REACHED', metric, limit: 0, used }, HttpStatus.PAYMENT_REQUIRED);
    if (limit === -1) return;
    if (used + amount > limit) throw new HttpException({ statusCode: 402, code: 'LIMIT_REACHED', metric, limit, used }, HttpStatus.PAYMENT_REQUIRED);
    if (limit > 0 && used + amount >= limit * 0.8) await this.warnOnce(userId, metric, used + amount, limit);
  }
  private async warnOnce(userId: string, metric: string, used: number, limit: number) {
    const title = `Usage warning: ${metric}`;
    const sent = await this.prisma.notification.findFirst({ where: { userId, type: 'usage_warning', title, createdAt: { gte: monthStart() } }, select: { id: true } });
    if (!sent) await this.notifications.notify(userId, 'usage_warning', title, `You have used ${Math.round(used)} of ${limit} ${metric} this month on your current plan.`, { email: true });
  }
  async record(userId: string, metric: string, quantity: number) { await this.prisma.usageRecord.create({ data: { userId, metric, quantity } }); }
  async summary(userId: string) {
    const { plan, sub } = await this.planFor(userId); const limits = plan.limits as Record<string, number>;
    const used = Object.fromEntries(await Promise.all(Object.keys(limits).map(async (m) => [m, Math.round((await this.used(userId, m)) * 10) / 10])));
    return { plan: { code: plan.code, name: plan.name }, limits, used, subscription: sub ? { status: sub.status, interval: sub.interval, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd } : null };
  }
}
