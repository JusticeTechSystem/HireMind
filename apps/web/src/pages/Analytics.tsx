import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';

interface A { totals: { sessions: number; practiceMinutes: number; questions: number; answeredQuestions: number; mockInterviews: number; codingRequests: number };
  categories: { category: string; count: number }[]; weekly: { week: string; sessions: number; minutes: number }[]; monthly: { month: string; sessions: number; minutes: number; avgMockScore: number | null }[];
  mock: { scores: { date: string; category: string; score: number }[]; performance: Record<string, number | null>; dimensionAverages: Record<string, number | null>; trend: { direction: string; delta: number } } }
export function Bars({ rows, label }: { rows: { k: string; v: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return <><div role="img" aria-label={`${label} chart`} className="flex items-end gap-1 h-28">{rows.map((r) => <div key={r.k} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${r.k}: ${r.v}`}>
    <div className="w-full bg-accent rounded-t" style={{ height: `${(r.v / max) * 85}%` }} /><span className="text-[11px] text-gray-400 truncate w-full text-center">{r.k.slice(-5)}</span></div>)}</div>
    <ul className="sr-only" aria-label={`${label} data`}>{rows.map((r) => <li key={r.k}>{r.k}: {r.v}</li>)}</ul></>;
}
const Card = ({ l, v }: { l: string; v: string | number }) => <div className="rounded bg-charcoal p-3"><div className="text-xl">{v}</div><div className="text-xs text-gray-400">{l}</div></div>;
export function Analytics() {
  const q = useQuery({ queryKey: ['analytics'], queryFn: () => api<A>('/analytics?days=90') }); const a = q.data;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-2xl mx-auto space-y-4">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link><h1 className="text-2xl font-semibold">Analytics</h1>
      {q.isLoading && <p className="text-gray-400">Loading…</p>}{q.isError && <p role="alert" className="text-red-400">Could not load analytics.</p>}
      {a && <>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2"><Card l="Sessions" v={a.totals.sessions} /><Card l="Practice (min)" v={a.totals.practiceMinutes} /><Card l="Questions" v={a.totals.questions} />
          <Card l="Answered" v={a.totals.answeredQuestions} /><Card l="Mock interviews" v={a.totals.mockInterviews} /><Card l="Coding requests" v={a.totals.codingRequests} /></div>
        {a.totals.sessions === 0 && a.totals.mockInterviews === 0 && <p className="text-gray-400 text-sm">No activity yet — charts appear after your first session or mock interview.</p>}
        {a.weekly.length > 0 && <section><h2 className="font-medium mb-1">Weekly activity (sessions, last 90 days)</h2><Bars label="Weekly sessions" rows={a.weekly.map((w) => ({ k: w.week, v: w.sessions }))} /></section>}
        {a.categories.length > 0 && <section><h2 className="font-medium mb-1">Question categories</h2><ul className="text-sm">{a.categories.map((c) => <li key={c.category}>{c.category}: {c.count}</li>)}</ul></section>}
        {a.mock.scores.length > 0 && <section><h2 className="font-medium mb-1">Mock interview scores</h2><Bars label="Mock scores" rows={a.mock.scores.map((s) => ({ k: s.date, v: s.score }))} />
          <p className="text-sm mt-1">Trend: {a.mock.trend.direction === 'insufficient' ? 'need 4+ mock interviews' : `${a.mock.trend.direction} (${a.mock.trend.delta > 0 ? '+' : ''}${a.mock.trend.delta} pts)`}</p>
          <ul className="text-sm mt-1">{Object.entries(a.mock.performance).map(([k, v]) => <li key={k}>{k}: {v === null ? '—' : `${v}/100`}</li>)}</ul></section>}
        {a.monthly.length > 0 && <section><h2 className="font-medium mb-1">Monthly progress</h2><ul className="text-sm">{a.monthly.map((m) => <li key={m.month}>{m.month}: {m.sessions} sessions, {m.minutes} min{m.avgMockScore !== null && `, mock avg ${m.avgMockScore}`}</li>)}</ul></section>}
      </>}
    </main>
  );
}
