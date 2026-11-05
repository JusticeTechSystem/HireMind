import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '@hiremind/config';
import { PrismaService } from '../prisma/prisma.service';

export const cutoff = (now: Date, days: number) => new Date(now.getTime() - days * 864e5);

/**
 * Deletes transcripts older than each user's chosen retention (7/30/90/365 days), then applies the platform default
 * (TRANSCRIPT_RETENTION_DAYS_DEFAULT) to users who made no choice, and prunes AI request logs (AI_LOG_RETENTION_DAYS).
 * Only transcript text is removed: sessions, questions, answers and summaries are kept. Idempotent, so running on several instances is harmless.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Retention'); private timers: NodeJS.Timeout[] = [];
  constructor(private prisma: PrismaService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const go = () => void this.run().catch((e) => this.log.warn(`retention run failed: ${e.message}`));
    this.timers = [setTimeout(go, 60_000), setInterval(go, 6 * 3_600_000)]; this.timers.forEach((t) => t.unref());
  }
  onModuleDestroy() { this.timers.forEach((t) => clearTimeout(t)); }

  async run(now = new Date()) {
    const env = loadEnv(); let transcripts = 0;
    const profiles = await this.prisma.profile.findMany({ where: { retentionDays: { not: null } }, select: { userId: true, retentionDays: true }, take: 5000 });
    for (const p of profiles) transcripts += (await this.prisma.transcript.deleteMany({ where: { session: { userId: p.userId }, createdAt: { lt: cutoff(now, p.retentionDays as number) } } })).count;
    if (env.TRANSCRIPT_RETENTION_DAYS_DEFAULT)
      transcripts += (await this.prisma.transcript.deleteMany({ where: { createdAt: { lt: cutoff(now, env.TRANSCRIPT_RETENTION_DAYS_DEFAULT) }, session: { user: { OR: [{ profile: { is: null } }, { profile: { retentionDays: null } }] } } } })).count;
    const aiLogs = (await this.prisma.aiRequestLog.deleteMany({ where: { createdAt: { lt: cutoff(now, env.AI_LOG_RETENTION_DAYS) } } })).count;
    await this.prisma.idempotencyKey?.deleteMany({ where: { createdAt: { lt: cutoff(now, 1) } } });
    if (transcripts || aiLogs) await this.prisma.auditLog.create({ data: { action: 'retention.run', meta: { transcripts, aiLogs } } });
    return { transcripts, aiLogs };
  }
}
