import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '@justiceview/config';
import { AuditService } from '../admin/audit.service';
import { StripeGateway } from '../billing/stripe.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../resumes/storage';

@Injectable()
export class AccountService {
  constructor(private prisma: PrismaService, private storage: StorageService, private stripe: StripeGateway, private audit: AuditService) {}

  /** Everything we hold about the user, as JSON (data portability). */
  async export(userId: string) {
    const w = { userId }; const [user, profile, resumes, sessions, mocks, notifications, payments, subscriptions, usage, tickets, answerFeedback] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, createdAt: true } }), this.prisma.profile.findUnique({ where: w }),
      this.prisma.resume.findMany({ where: w, select: { id: true, fileName: true, createdAt: true, isDefault: true, extractedText: true, structured: true } }),
      this.prisma.interviewSession.findMany({ where: w, include: { transcripts: true, questions: { include: { answers: true } } } }),
      this.prisma.mockInterview.findMany({ where: w, include: { questions: { include: { response: true } } } }),
      this.prisma.notification.findMany({ where: w }), this.prisma.payment.findMany({ where: w }), this.prisma.subscription.findMany({ where: w }), this.prisma.usageRecord.findMany({ where: w }), this.prisma.supportTicket.findMany({ where: w }), this.prisma.answerFeedback.findMany({ where: w })]);
    return { exportedAt: new Date().toISOString(), user, profile, resumes, sessions, mockInterviews: mocks, notifications, payments, subscriptions, usage, supportTickets: tickets, answerFeedback };
  }

  private async deleteAuthUser(userId: string) {
    const e = loadEnv(); if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return; // dev without Supabase
    const r = await fetch(`${e.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, apikey: e.SUPABASE_SERVICE_ROLE_KEY } });
    if (!r.ok && r.status !== 404) throw new BadGatewayException('Could not delete the login record; nothing was deleted, please retry');
  }

  /** External systems first (a failure aborts before any local data is removed, so the user can retry), then one DB transaction. */
  async delete(userId: string) {
    const subs = await this.prisma.subscription.findMany({ where: { userId, stripeSubscriptionId: { not: null }, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, select: { stripeSubscriptionId: true } });
    for (const s of subs) await this.stripe.cancelSubscription(s.stripeSubscriptionId as string);
    for (const r of await this.prisma.resume.findMany({ where: { userId }, select: { storagePath: true } })) {
      try { await this.storage.remove(r.storagePath); } catch (e) { if (!(e instanceof ServiceUnavailableException)) throw e; }
    }
    const avatar = await this.prisma.profile.findUnique({ where: { userId }, select: { avatarPath: true } });
    if (avatar?.avatarPath) { try { await this.storage.remove(avatar.avatarPath, loadEnv().SUPABASE_AVATAR_BUCKET); } catch (e) { if (!(e instanceof ServiceUnavailableException)) throw e; } }
    await this.deleteAuthUser(userId);
    await this.prisma.$transaction([this.prisma.deletedAccount.create({ data: { id: userId } }), this.prisma.aiRequestLog.deleteMany({ where: { userId } }), this.prisma.user.delete({ where: { id: userId } })]);
    await this.audit.log(null, 'account.delete', `user:${userId}`); // no email or content is kept
    return { ok: true };
  }
}
