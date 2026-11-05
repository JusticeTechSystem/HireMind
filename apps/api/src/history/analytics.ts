import { Controller, DefaultValuePipe, Get, Injectable, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

/** Monday (UTC) of the date's week, YYYY-MM-DD. */
export function weekKey(d: Date) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); }
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const mean = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
/** Compares the mean of the later half of scores with the earlier half; needs >= 4 scores. */
export function trend(scores: number[]) {
  if (scores.length < 4) return { direction: 'insufficient' as const, delta: 0 };
  const h = Math.floor(scores.length / 2); const delta = Math.round(((mean(scores.slice(-h)) ?? 0) - (mean(scores.slice(0, h)) ?? 0)) * 10) / 10;
  return { direction: delta > 3 ? ('improving' as const) : delta < -3 ? ('declining' as const) : ('flat' as const), delta };
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}
  /** Everything is derived from stored rows; nothing is estimated or hardcoded. */
  async get(userId: string, days = 90) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [sessions, cats, questions, answered, mocks, coding] = await Promise.all([
      this.prisma.interviewSession.findMany({ where: { userId }, select: { createdAt: true, activeMs: true }, orderBy: { createdAt: 'asc' }, take: 5000 }),
      this.prisma.interviewQuestion.groupBy({ by: ['category'], where: { session: { userId } }, _count: { _all: true } }),
      this.prisma.interviewQuestion.count({ where: { session: { userId } } }),
      this.prisma.interviewQuestion.count({ where: { session: { userId }, answers: { some: {} } } }),
      this.prisma.mockInterview.findMany({ where: { userId, status: 'COMPLETED', overallScore: { not: null } }, orderBy: { completedAt: 'asc' }, take: 500,
        select: { category: true, overallScore: true, summary: true, completedAt: true } }),
      this.prisma.usageRecord.aggregate({ where: { userId, metric: 'advancedCodingRequests' }, _sum: { quantity: true } })]);
    const week = new Map<string, { sessions: number; minutes: number }>(); const month = new Map<string, { sessions: number; minutes: number }>();
    for (const s of sessions) { if (s.createdAt < since) continue;
      for (const [m, k] of [[week, weekKey(s.createdAt)], [month, monthKey(s.createdAt)]] as const) { const e = m.get(k) ?? { sessions: 0, minutes: 0 }; e.sessions++; e.minutes += s.activeMs / 60000; m.set(k, e); } }
    const scores = mocks.map((m) => ({ date: m.completedAt!, category: m.category, score: m.overallScore as number }));
    const byCat = (c: string) => mean(scores.filter((s) => s.category === c).map((s) => s.score));
    const monthScores = new Map<string, number[]>(); for (const s of scores) { const k = monthKey(s.date); monthScores.set(k, [...(monthScores.get(k) ?? []), s.score]); }
    const dims: Record<string, number[]> = {};
    for (const m of mocks) for (const [k, v] of Object.entries(((m.summary as { dimensionAverages?: Record<string, number> } | null)?.dimensionAverages) ?? {})) (dims[k] ??= []).push(v);
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      totals: { sessions: sessions.length, practiceMinutes: Math.round(sessions.reduce((a, s) => a + s.activeMs, 0) / 60000), questions, answeredQuestions: answered, mockInterviews: mocks.length, codingRequests: coding._sum.quantity ?? 0 },
      categories: cats.map((c) => ({ category: c.category, count: c._count._all })).sort((a, b) => b.count - a.count),
      weekly: [...week].map(([w, v]) => ({ week: w, sessions: v.sessions, minutes: round(v.minutes) })),
      monthly: [...new Set([...month.keys(), ...monthScores.keys()])].sort().map((k) => ({ month: k, sessions: month.get(k)?.sessions ?? 0, minutes: round(month.get(k)?.minutes ?? 0), avgMockScore: mean(monthScores.get(k) ?? []) })),
      mock: { scores: scores.map((s) => ({ date: s.date.toISOString().slice(0, 10), category: s.category, score: s.score })),
        performance: { coding: byCat('coding'), technical: byCat('technical'), behavioral: byCat('behavioral'), systemDesign: byCat('system-design'), mixed: byCat('mixed') },
        dimensionAverages: Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, mean(v)])), trend: trend(scores.map((s) => s.score)) },
    };
  }
}

@Controller('analytics')
@UseGuards(AuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}
  @Get() get(@CurrentUser() u: AuthUser, @Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number) { return this.svc.get(u.id, Math.min(365, Math.max(7, days))); }
}
