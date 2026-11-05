import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { integrationStatus, loadEnv } from '@justiceview/config';
import { PrismaService } from '../prisma/prisma.service';
import { Pricing, pricingSchema } from './admin.schemas';

export interface ModelUsage { model: string; requests: number; failures: number; inputTokens: number; outputTokens: number }
/** Cost is only estimated for models that have admin-configured pricing; nothing is assumed. */
export function estimateCost(rows: ModelUsage[], pricing: Pricing) {
  const models = rows.map((r) => { const p = pricing.models[r.model]; return { ...r, cost: p ? Math.round(((r.inputTokens * p.inputPer1M + r.outputTokens * p.outputPer1M) / 1e6) * 10000) / 10000 : null }; });
  const priced = models.filter((m) => m.cost !== null);
  return { currency: pricing.currency, total: priced.length ? Math.round(priced.reduce((a, m) => a + (m.cost as number), 0) * 10000) / 10000 : null, models, unpricedModels: models.filter((m) => m.cost === null).map((m) => m.model) };
}

@Injectable()
export class AiMonitorService {
  constructor(private prisma: PrismaService) {}
  async ai(days = 7) {
    const since = new Date(Date.now() - days * 864e5);
    const [groups, failures, daily, transcription, setting, fb] = await Promise.all([
      this.prisma.aiRequestLog.groupBy({ by: ['model', 'status'], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { promptTokens: true, completionTokens: true, latencyMs: true } }),
      this.prisma.aiRequestLog.findMany({ where: { createdAt: { gte: since }, status: 'error' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, model: true, purpose: true, httpStatus: true, createdAt: true } }),
      this.prisma.$queryRaw<{ day: Date; count: number; failed: number }[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count, (count(*) FILTER (WHERE status = 'error'))::int AS failed FROM "AiRequestLog" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`),
      this.prisma.usageRecord.aggregate({ where: { metric: 'transcriptionMinutes', createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } }),
      this.prisma.answerFeedback.groupBy({ by: ['rating'], where: { createdAt: { gte: since } }, _count: { _all: true } })]);
    const pricing = pricingSchema.parse(setting?.value ?? {});
    const byModel = new Map<string, ModelUsage>(); let latency = 0;
    for (const g of groups) { const m = byModel.get(g.model) ?? { model: g.model, requests: 0, failures: 0, inputTokens: 0, outputTokens: 0 };
      m.requests += g._count._all; if (g.status === 'error') m.failures += g._count._all; m.inputTokens += g._sum.promptTokens ?? 0; m.outputTokens += g._sum.completionTokens ?? 0; latency += g._sum.latencyMs ?? 0; byModel.set(g.model, m); }
    const rows = [...byModel.values()]; const requests = rows.reduce((a, r) => a + r.requests, 0); const failed = rows.reduce((a, r) => a + r.failures, 0);
    const minutes = transcription._sum.quantity ?? 0;
    const up = fb.find((f) => f.rating === 1)?._count._all ?? 0, down = fb.find((f) => f.rating === -1)?._count._all ?? 0;
    return { days, totals: { requests, failures: failed, failureRate: requests ? Math.round((failed / requests) * 1000) / 10 : 0, inputTokens: rows.reduce((a, r) => a + r.inputTokens, 0), outputTokens: rows.reduce((a, r) => a + r.outputTokens, 0), avgLatencyMs: requests ? Math.round(latency / requests) : 0 },
      cost: estimateCost(rows, pricing), transcription: { minutes: Math.round(minutes * 10) / 10, estimatedCost: pricing.transcriptionPerMinute === undefined ? null : Math.round(minutes * pricing.transcriptionPerMinute * 100) / 100 },
      feedback: { helpful: up, notHelpful: down, helpfulRate: up + down ? Math.round((up / (up + down)) * 1000) / 10 : null },
      daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), count: d.count, failed: d.failed })), recentFailures: failures };
  }
  async health() {
    const hour = new Date(Date.now() - 36e5);
    const jobs = await this.prisma.job?.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []) ?? [];
    const [db, total, failed] = await Promise.all([this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.prisma.aiRequestLog.count({ where: { createdAt: { gte: hour } } }), this.prisma.aiRequestLog.count({ where: { createdAt: { gte: hour }, status: 'error' } })]);
    return { time: new Date().toISOString(), database: db, integrations: integrationStatus(loadEnv()), jobs: Object.fromEntries(jobs.map((j: { status: string; _count: { _all: number } }) => [j.status, j._count._all])), redis: 'optional: socket adapter, cache and rate limiting use it when enabled', aiLastHour: { requests: total, failures: failed } };
  }
}
