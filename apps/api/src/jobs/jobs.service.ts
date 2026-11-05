import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type JobHandler = (payload: any) => Promise<void>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Claimed { id: string; type: string; payload: unknown; attempts: number }
export const MAX_ATTEMPTS = 5;
export const backoffMs = (attempts: number) => Math.min(60_000 * 2 ** (attempts - 1), 3_600_000);

/**
 * Postgres-backed job queue (no extra infrastructure). Workers claim a job with `FOR UPDATE SKIP LOCKED`, so any number of API instances can
 * run safely; jobs stuck RUNNING for 5 min are reclaimed; failures retry with exponential backoff up to 5 attempts, then stay FAILED for inspection.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Jobs'); private handlers = new Map<string, JobHandler>(); private timer?: NodeJS.Timeout; private busy = false;
  constructor(private prisma: PrismaService) {}
  register(type: string, h: JobHandler) { this.handlers.set(type, h); }
  enqueue(type: string, payload: unknown, runAt = new Date()) { return this.prisma.job.create({ data: { type, payload: payload as never, runAt } }); }
  onModuleInit() { if (process.env.NODE_ENV === 'test') return; this.timer = setInterval(() => void this.tick().catch((e) => this.log.warn(`tick failed: ${e.message}`)), 2000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async claim(): Promise<Claimed | undefined> {
    const rows = await this.prisma.$queryRaw<Claimed[]>`UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1
      WHERE "id" = (SELECT "id" FROM "Job" WHERE ("status" = 'PENDING' AND "runAt" <= now()) OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '5 minutes') ORDER BY "runAt" FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING "id", "type", "payload", "attempts"`;
    return rows[0];
  }
  async tick() { if (this.busy) return; this.busy = true; try { for (let j = await this.claim(); j; j = await this.claim()) await this.run(j); } finally { this.busy = false; } }
  async run(job: Claimed) {
    try {
      const h = this.handlers.get(job.type); if (!h) throw new Error(`no handler for ${job.type}`);
      await h(job.payload); await this.prisma.job.update({ where: { id: job.id }, data: { status: 'DONE', lastError: null, lockedAt: null } });
    } catch (e) {
      const dead = job.attempts >= MAX_ATTEMPTS; this.log.warn(`job ${job.type} attempt ${job.attempts} failed: ${(e as Error).message}`);
      await this.prisma.job.update({ where: { id: job.id }, data: { status: dead ? 'FAILED' : 'PENDING', runAt: new Date(Date.now() + backoffMs(job.attempts)), lastError: String((e as Error).message).slice(0, 500), lockedAt: null } });
    }
  }
}
@Global() @Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
