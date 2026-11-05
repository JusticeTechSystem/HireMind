import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';

const btn = 'rounded border border-white/20 px-3 py-1 text-sm disabled:opacity-40';
interface Plan { code: string; name: string; limits: Record<string, number>; currency: string; priceMonthlyCents: number | null; priceAnnualCents: number | null; monthlyAvailable: boolean; annualAvailable: boolean }
const money = (c: number | null, cur: string) => (c === null ? 'Price not set' : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(c / 100));
const lim = (n?: number) => (n === -1 ? '∞' : n ?? 0);
const LABEL: Record<string, string> = { aiRequests: 'AI requests', transcriptionMinutes: 'Transcription minutes', resumeAnalyses: 'Resume analyses', mockInterviews: 'Mock interviews', advancedCodingRequests: 'Advanced coding requests' };

function Cards({ plans, action }: { plans: Plan[]; action: (p: Plan, interval: 'monthly' | 'annual') => React.ReactNode }) {
  const [annual, setAnnual] = useState(false);
  return <div className="space-y-3"><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />Annual billing</label>
    <div className="grid gap-3 sm:grid-cols-3">{plans.map((p) => <div key={p.code} className="rounded bg-charcoal p-4 space-y-2"><h3 className="font-semibold">{p.name}</h3>
      <p>{p.code === 'free' ? 'Free' : money(annual ? p.priceAnnualCents : p.priceMonthlyCents, p.currency)}{p.code !== 'free' && <span className="text-xs text-gray-400">/{annual ? 'year' : 'month'}</span>}</p>
      <ul className="text-xs text-gray-300">{Object.entries(p.limits).map(([k, v]) => <li key={k}>{LABEL[k] ?? k}: {lim(v)}/mo</li>)}</ul>{action(p, annual ? 'annual' : 'monthly')}</div>)}</div></div>;
}

export function Pricing() {
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/billing/plans') });
  return <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-3xl mx-auto space-y-4"><h1 className="text-2xl font-semibold">Pricing</h1>
    {plans.isLoading && <p className="text-gray-400">Loading…</p>}{plans.isError && <p role="alert" className="text-red-400">Could not load plans.</p>}
    {plans.data && <Cards plans={plans.data} action={() => <Link to="/register" className="inline-block rounded bg-accent px-3 py-1 text-sm">Get started</Link>} />}</main>;
}

export function Billing() {
  const [sp] = useSearchParams(); const qc = useQueryClient();
  const me = useQuery({ queryKey: ['billing-me'], queryFn: () => api<{ plan: { code: string; name: string }; limits: Record<string, number>; used: Record<string, number>; subscription: { status: string; interval: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null }>('/billing/me') });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/billing/plans') });
  const pays = useQuery({ queryKey: ['payments'], queryFn: () => api<{ id: string; amount: number; currency: string; status: string; createdAt: string; hostedInvoiceUrl: string | null }[]>('/billing/payments') });
  const go = (p: string, b?: object) => api<{ url: string }>(p, { method: 'POST', body: b ? JSON.stringify(b) : undefined }).then((r) => { window.location.href = r.url; });
  const checkout = useMutation({ mutationFn: (v: { plan: string; interval: string }) => go('/billing/checkout', v) });
  const portal = useMutation({ mutationFn: () => go('/billing/portal'), onSuccess: () => qc.invalidateQueries() });
  const m = me.data;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-3xl mx-auto space-y-4">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link><h1 className="text-2xl font-semibold">Billing</h1>
      {sp.get('status') === 'success' && <p role="status" className="text-green-300 text-sm">Payment received. Your plan updates as soon as Stripe confirms it — refresh in a moment.</p>}
      {sp.get('status') === 'cancelled' && <p className="text-gray-400 text-sm">Checkout cancelled.</p>}
      {me.isLoading && <p className="text-gray-400">Loading…</p>}{me.isError && <p role="alert" className="text-red-400">Could not load billing.</p>}
      {m && <section className="rounded bg-charcoal p-4 space-y-2"><p>Current plan: <b>{m.plan.name}</b>{m.subscription && <span className="text-xs text-gray-400"> · {m.subscription.status} · {m.subscription.interval}{m.subscription.currentPeriodEnd && ` · renews ${new Date(m.subscription.currentPeriodEnd).toLocaleDateString()}`}{m.subscription.cancelAtPeriodEnd && ' · cancels at period end'}</span>}</p>
        <ul className="text-sm space-y-1">{Object.entries(m.limits).map(([k, v]) => <li key={k}>{LABEL[k] ?? k}: {m.used[k] ?? 0} / {lim(v)}{v > 0 && <div className="h-1 bg-navy rounded"><div className="h-1 bg-accent rounded" style={{ width: `${Math.min(100, ((m.used[k] ?? 0) / v) * 100)}%` }} /></div>}</li>)}</ul>
        <p className="text-xs text-gray-400">Usage resets each calendar month (UTC).</p>
        {(m.subscription || (pays.data?.length ?? 0) > 0) && <button className={btn} disabled={portal.isPending} onClick={() => portal.mutate()}>Manage subscription / invoices</button>}</section>}
      {plans.data && !m?.subscription && <Cards plans={plans.data.filter((p) => p.code !== 'free')} action={(p, interval) => <button className="rounded bg-accent px-3 py-1 text-sm disabled:opacity-50" disabled={checkout.isPending || !(interval === 'annual' ? p.annualAvailable : p.monthlyAvailable)}
        onClick={() => checkout.mutate({ plan: p.code, interval })}>{(interval === 'annual' ? p.annualAvailable : p.monthlyAvailable) ? 'Upgrade' : 'Not available yet'}</button>} />}
      {(checkout.isError || portal.isError) && <p role="alert" className="text-red-400 text-sm">Billing action failed (Stripe may not be configured).</p>}
      <section><h2 className="font-medium">Payment history</h2>{pays.data?.length === 0 && <p className="text-gray-400 text-sm">No payments yet.</p>}
        <ul className="text-sm">{pays.data?.map((p) => <li key={p.id}>{new Date(p.createdAt).toLocaleDateString()} · {money(p.amount, p.currency)} · {p.status}{p.hostedInvoiceUrl && <> · <a className="underline" href={p.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">Invoice</a></>}</li>)}</ul></section>
    </main>
  );
}

export function Notifications() {
  const qc = useQueryClient();
  const n = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[]; unread: number }>('/notifications') });
  const all = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-xl mx-auto space-y-3"><Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
    <div className="flex items-center"><h1 className="text-2xl font-semibold flex-1">Notifications{n.data?.unread ? ` (${n.data.unread})` : ''}</h1><button className={btn} disabled={!n.data?.unread} onClick={() => all.mutate()}>Mark all read</button></div>
    {n.data?.items.length === 0 && <p className="text-gray-400 text-sm">Nothing here yet.</p>}
    <ul className="space-y-2 text-sm">{n.data?.items.map((x) => <li key={x.id} className={`rounded bg-charcoal p-3 ${x.readAt ? 'opacity-60' : ''}`}><b>{x.title}</b><p>{x.body}</p><p className="text-xs text-gray-400">{new Date(x.createdAt).toLocaleString()}</p></li>)}</ul></main>;
}
