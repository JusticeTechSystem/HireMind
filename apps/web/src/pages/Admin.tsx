import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { Bars } from './Analytics';

const btn = 'rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-40';
const cls = 'rounded bg-charcoal border border-white/10 p-1 text-sm';
const TABS = ['Overview', 'Users', 'Subscriptions', 'AI', 'Platform', 'Plans', 'Support', 'Announcements', 'Audit'] as const;
const isSuper = (roles: string[]) => roles.includes('SUPER_ADMIN');
const date = (s: string) => new Date(s).toLocaleString();
type Me = { id: string; email: string; roles: string[] };
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

const Pager = ({ d, set }: { d?: Paged<unknown>; set: (n: number) => void }) => d ? <div className="flex gap-2 items-center text-xs"><button className={btn} disabled={d.page <= 1} onClick={() => set(d.page - 1)}>Prev</button>
  <span>Page {d.page} / {Math.max(1, Math.ceil(d.total / d.pageSize))}</span><button className={btn} disabled={d.page * d.pageSize >= d.total} onClick={() => set(d.page + 1)}>Next</button></div> : null;
const Err = ({ q }: { q: { isError: boolean } }) => q.isError ? <p role="alert" className="text-red-400 text-sm">Request failed (403 means this action needs a higher role).</p> : null;
function Json({ value, onSave, label }: { value: unknown; onSave: (v: unknown) => void; label: string }) {
  const [t, setT] = useState(JSON.stringify(value, null, 2)); const [e, setE] = useState('');
  return <div className="space-y-1"><textarea aria-label={label} className={`${cls} w-full font-mono text-xs`} rows={10} value={t} onChange={(x) => setT(x.target.value)} />
    <button className={btn} onClick={() => { try { onSave(JSON.parse(t)); setE(''); } catch { setE('Invalid JSON'); } }}>Save</button>{e && <span className="text-red-400 text-xs ml-2">{e}</span>}</div>;
}

function Overview() {
  const o = useQuery({ queryKey: ['a-ov'], queryFn: () => api<any>('/admin/overview') }); const h = useQuery({ queryKey: ['a-health'], queryFn: () => api<any>('/admin/health') });
  return <div className="space-y-3 text-sm"><Err q={o} />{o.data && <ul className="grid grid-cols-2 gap-2">{Object.entries(o.data).filter(([, v]) => typeof v === 'number').map(([k, v]) => <li key={k} className="rounded bg-charcoal p-2"><b className="text-lg">{String(v)}</b><br /><span className="text-xs text-gray-400">{k}</span></li>)}</ul>}
    {o.data?.activeSubscriptions.length > 0 && <p>Active subscriptions: {o.data.activeSubscriptions.map((s: any) => `${s.plan} ${s.count}`).join(' · ')}</p>}
    {h.data && <section className="rounded bg-charcoal p-3"><h3 className="font-medium">System health</h3><p>Database: {h.data.database ? 'ok' : 'DOWN'} · AI last hour: {h.data.aiLastHour.requests} requests, {h.data.aiLastHour.failures} failed · Redis: {h.data.redis}</p>
      <p className="text-xs text-gray-400">Integrations configured: {Object.entries(h.data.integrations).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(' · ')}</p></section>}</div>;
}

function Users({ me }: { me: Me }) {
  const qc = useQueryClient(); const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [sel, setSel] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['a-users', q, status, page], queryFn: () => api<Paged<any>>(`/admin/users?page=${page}&q=${encodeURIComponent(q)}&status=${status}`) });
  const det = useQuery({ queryKey: ['a-user', sel], enabled: !!sel, queryFn: () => api<any>(`/admin/users/${sel}`) });
  const inv = () => { qc.invalidateQueries({ queryKey: ['a-users'] }); qc.invalidateQueries({ queryKey: ['a-user'] }); };
  const act = useMutation({ mutationFn: (v: { path: string; method?: string; body?: object }) => api(v.path, { method: v.method ?? 'POST', body: v.body ? JSON.stringify(v.body) : undefined }), onSuccess: inv });
  const d = det.data;
  return <div className="space-y-2 text-sm"><div className="flex gap-2"><input aria-label="Search users" placeholder="Search email…" className={`${cls} flex-1`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
    <select aria-label="Status" className={cls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
    <Err q={list} /><Err q={act} />
    <ul className="space-y-1">{list.data?.items.map((u) => <li key={u.id} className="rounded bg-charcoal p-2 flex gap-2 items-center"><button className="underline flex-1 text-left truncate" onClick={() => setSel(u.id)}>{u.email}</button>
      <span className="text-xs text-gray-400">{u.roles.join(',')} · {u.plan}</span>{u.suspended && <b className="text-red-400 text-xs">SUSPENDED</b>}</li>)}</ul>
    <Pager d={list.data} set={setPage} />
    {d && <section className="rounded bg-charcoal p-3 space-y-1"><h3 className="font-medium">{d.email}</h3><p className="text-xs text-gray-400">{d.profile?.fullName ?? 'No profile'} · joined {date(d.createdAt)} · {d.counts.sessions} sessions, {d.counts.resumes} resumes, {d.counts.mocks} mocks</p>
      <p className="text-xs">Plan: {d.usage.plan.name} · usage {Object.entries(d.usage.used).map(([k, v]) => `${k} ${v}/${(d.usage.limits as any)[k]}`).join(', ')}</p>
      <p className="text-xs text-gray-400">Interview content (transcripts, resumes, answers) is not visible to admins.</p>
      <div className="flex gap-2 pt-1">{d.suspended ? <button className={btn} onClick={() => act.mutate({ path: `/admin/users/${d.id}/reactivate` })}>Reactivate</button>
        : <button className={btn} disabled={d.id === me.id} onClick={() => { const r = prompt('Reason for suspension?'); if (r && r.trim().length >= 3) act.mutate({ path: `/admin/users/${d.id}/suspend`, body: { reason: r } }); }}>Suspend</button>}
        {isSuper(me.roles) && !d.roles.includes('SUPER_ADMIN') && d.id !== me.id && <button className={btn} onClick={() => confirm('Change role?') && act.mutate({ path: `/admin/users/${d.id}/role`, method: 'PUT', body: { role: d.roles.includes('ADMIN') ? 'USER' : 'ADMIN' } })}>{d.roles.includes('ADMIN') ? 'Remove admin' : 'Make admin'}</button>}</div>
      {d.history.length > 0 && <ul className="text-xs text-gray-400">{d.history.map((h: any) => <li key={h.id}>{date(h.createdAt)} · {h.action}</li>)}</ul>}</section>}</div>;
}

function Subs({ me }: { me: Me }) {
  const qc = useQueryClient(); const [page, setPage] = useState(1); const [pp, setPp] = useState(1);
  const refund = useMutation({ mutationFn: (id: string) => api(`/admin/payments/${id}/refund`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['a-pay'] }) });
  const s = useQuery({ queryKey: ['a-subs', page], queryFn: () => api<Paged<any>>(`/admin/subscriptions?page=${page}`) }); const p = useQuery({ queryKey: ['a-pay', pp], queryFn: () => api<Paged<any>>(`/admin/payments?page=${pp}`) });
  return <div className="space-y-3 text-sm"><Err q={s} /><h3 className="font-medium">Subscriptions</h3><ul>{s.data?.items.map((x) => <li key={x.id}>{x.user.email} · {x.plan.name} · {x.status} · {x.interval ?? '—'}{x.cancelAtPeriodEnd && ' · cancelling'}</li>)}</ul><Pager d={s.data} set={setPage} />
    <h3 className="font-medium">Payments</h3><ul>{p.data?.items.map((x) => <li key={x.id}>{x.user.email} · {(x.amount / 100).toFixed(2)} {x.currency.toUpperCase()} · {x.status} · {date(x.createdAt)}{x.status === 'paid' && isSuper(me.roles) && <button className={`${btn} ml-2`} disabled={refund.isPending} onClick={() => confirm('Refund this payment in full?') && refund.mutate(x.id)}>Refund</button>}</li>)}</ul><Err q={refund} /><Pager d={p.data} set={setPp} /></div>;
}

function Ai() {
  const [days, setDays] = useState(7); const a = useQuery({ queryKey: ['a-ai', days], queryFn: () => api<any>(`/admin/ai?days=${days}`) }); const d = a.data;
  return <div className="space-y-2 text-sm"><select aria-label="Window" className={cls} value={days} onChange={(e) => setDays(+e.target.value)}>{[1, 7, 30, 90].map((x) => <option key={x} value={x}>{x} days</option>)}</select><Err q={a} />
    {d && <><p>{d.totals.requests} requests · {d.totals.failures} failed ({d.totals.failureRate}%) · {d.totals.inputTokens} in / {d.totals.outputTokens} out tokens · avg {d.totals.avgLatencyMs} ms</p>
      <p>Estimated cost: {d.cost.total === null ? 'not configured (set model pricing under Plans)' : `${d.cost.total} ${d.cost.currency}`}{d.cost.unpricedModels.length > 0 && ` · unpriced: ${d.cost.unpricedModels.join(', ')}`}</p>
      <p>Answer feedback: {d.feedback.helpful} helpful / {d.feedback.notHelpful} not helpful{d.feedback.helpfulRate !== null && ` (${d.feedback.helpfulRate}% helpful)`}</p>
      <p>Transcription: {d.transcription.minutes} min{d.transcription.estimatedCost !== null && ` ≈ ${d.transcription.estimatedCost}`}</p>
      <ul>{d.cost.models.map((m: any) => <li key={m.model}>{m.model}: {m.requests} req, {m.failures} failed, cost {m.cost ?? '—'}</li>)}</ul>
      <h3 className="font-medium">Recent failures</h3>{d.recentFailures.length === 0 && <p className="text-gray-400">None.</p>}<ul className="text-xs">{d.recentFailures.map((f: any) => <li key={f.id}>{date(f.createdAt)} · {f.model} · HTTP {f.httpStatus ?? 'n/a'} · {f.purpose}</li>)}</ul></>}</div>;
}

function Platform() {
  const a = useQuery({ queryKey: ['a-plat'], queryFn: () => api<any>('/admin/analytics?days=30') }); const d = a.data;
  return <div className="space-y-3 text-sm"><Err q={a} />{d && <>
    <section><h3 className="font-medium">New accounts per day (30 days)</h3>{d.signups.length === 0 ? <p className="text-gray-400">No signups in this window.</p> : <Bars label="Signups" rows={d.signups.map((x: any) => ({ k: x.day, v: x.count }))} />}</section>
    <section><h3 className="font-medium">Sessions created per day</h3>{d.sessions.length === 0 ? <p className="text-gray-400">None.</p> : <Bars label="Sessions" rows={d.sessions.map((x: any) => ({ k: x.day, v: x.count }))} />}</section>
    <section><h3 className="font-medium">Feature usage (30 days)</h3><ul>{d.usage.map((u: any) => <li key={u.metric}>{u.metric}: {u.total}</li>)}</ul></section>
    <section><h3 className="font-medium">Payments (30 days)</h3>{d.revenue.length === 0 ? <p className="text-gray-400">None.</p> : <ul>{d.revenue.map((r: any, i: number) => <li key={i}>{r.status}: {(r.amountMinor / 100).toFixed(2)} {r.currency.toUpperCase()} ({r.count})</li>)}</ul>}</section>
    <p>Active subscriptions: {d.plans.length ? d.plans.map((p: any) => `${p.plan} ${p.count}`).join(' · ') : 'none'} · Mock interviews completed: {d.mocks.completed}{d.mocks.avgScore !== null && ` (avg ${d.mocks.avgScore}/100)`}</p></>}</div>;
}

function Plans({ me }: { me: Me }) {
  const qc = useQueryClient(); const plans = useQuery({ queryKey: ['a-plans'], queryFn: () => api<any[]>('/admin/plans') }); const pricing = useQuery({ queryKey: ['a-pricing'], queryFn: () => api<any>('/admin/settings/pricing') });
  const save = useMutation({ mutationFn: (v: { path: string; body: unknown }) => api(v.path, { method: 'PUT', body: JSON.stringify(v.body) }), onSuccess: () => qc.invalidateQueries() });
  return <div className="space-y-4 text-sm">{!isSuper(me.roles) && <p className="text-amber-400">Read-only: editing plans and pricing requires Super Admin.</p>}<Err q={save} />{save.isSuccess && <p className="text-green-300">Saved.</p>}
    {plans.data?.map((p) => { const { id, code, name, limits, priceMonthlyCents, priceAnnualCents, currency, stripePriceMonthly, stripePriceAnnual } = p;
      return <section key={id} className="rounded bg-charcoal p-3"><h3 className="font-medium">{name} ({code})</h3>
        {isSuper(me.roles) ? <Json label={`Edit ${code}`} value={{ name, limits, priceMonthlyCents, priceAnnualCents, currency, stripePriceMonthly, stripePriceAnnual }} onSave={(v) => save.mutate({ path: `/admin/plans/${code}`, body: v })} /> : <pre className="text-xs">{JSON.stringify(limits)}</pre>}</section>; })}
    {pricing.data && <section className="rounded bg-charcoal p-3"><h3 className="font-medium">AI cost pricing (per 1M tokens)</h3><p className="text-xs text-gray-400">Used only for cost estimates. Enter your provider's current rates per model name.</p>
      {isSuper(me.roles) ? <Json label="Pricing" value={pricing.data} onSave={(v) => save.mutate({ path: '/admin/settings/pricing', body: v })} /> : <pre className="text-xs">{JSON.stringify(pricing.data)}</pre>}</section>}</div>;
}

function Support() {
  const qc = useQueryClient(); const [page, setPage] = useState(1); const [status, setStatus] = useState('');
  const t = useQuery({ queryKey: ['a-tix', page, status], queryFn: () => api<Paged<any>>(`/admin/tickets?page=${page}&status=${status}`) });
  const upd = useMutation({ mutationFn: (v: { id: string; status: string; adminNote?: string }) => api(`/admin/tickets/${v.id}`, { method: 'PATCH', body: JSON.stringify({ status: v.status, adminNote: v.adminNote }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['a-tix'] }) });
  return <div className="space-y-2 text-sm"><select aria-label="Ticket status" className={cls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['OPEN', 'IN_PROGRESS', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</select><Err q={t} />
    {t.data?.items.length === 0 && <p className="text-gray-400">No tickets.</p>}
    {t.data?.items.map((x) => <article key={x.id} className="rounded bg-charcoal p-3 space-y-1"><b>{x.subject}</b> <span className="text-xs text-gray-400">{x.user.email} · {date(x.createdAt)} · {x.status}</span><p className="whitespace-pre-wrap">{x.body}</p>
      <div className="flex gap-2">{['OPEN', 'IN_PROGRESS', 'CLOSED'].filter((s) => s !== x.status).map((s) => <button key={s} className={btn} onClick={() => upd.mutate({ id: x.id, status: s, adminNote: s === 'CLOSED' ? prompt('Note to the user (optional)') ?? undefined : x.adminNote })}>{s}</button>)}</div></article>)}<Pager d={t.data} set={setPage} /></div>;
}

function Announcements() {
  const qc = useQueryClient(); const [f, setF] = useState({ title: '', body: '' }); const a = useQuery({ queryKey: ['a-ann'], queryFn: () => api<any[]>('/admin/announcements') });
  const inv = () => qc.invalidateQueries({ queryKey: ['a-ann'] });
  const create = useMutation({ mutationFn: () => api('/admin/announcements', { method: 'POST', body: JSON.stringify(f) }), onSuccess: () => { setF({ title: '', body: '' }); inv(); } });
  const toggle = useMutation({ mutationFn: (v: { id: string; active: boolean }) => api(`/admin/announcements/${v.id}`, { method: 'PATCH', body: JSON.stringify({ active: v.active }) }), onSuccess: inv });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/announcements/${id}`, { method: 'DELETE' }), onSuccess: inv });
  return <div className="space-y-2 text-sm"><input aria-label="Title" placeholder="Title" className={`${cls} w-full`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><textarea aria-label="Body" placeholder="Message" className={`${cls} w-full`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
    <button className={btn} disabled={create.isPending || f.title.length < 2 || f.body.length < 2} onClick={() => create.mutate()}>Publish</button><Err q={create} />
    {a.data?.map((x) => <article key={x.id} className="rounded bg-charcoal p-3"><b>{x.title}</b> <span className="text-xs text-gray-400">{x.active ? 'live' : 'hidden'}</span><p>{x.body}</p>
      <div className="flex gap-2"><button className={btn} onClick={() => toggle.mutate({ id: x.id, active: !x.active })}>{x.active ? 'Hide' : 'Show'}</button><button className={btn} onClick={() => confirm('Delete?') && del.mutate(x.id)}>Delete</button></div></article>)}</div>;
}

function Audit() {
  const [page, setPage] = useState(1); const [action, setAction] = useState(''); const a = useQuery({ queryKey: ['a-audit', page, action], queryFn: () => api<Paged<any>>(`/admin/audit?page=${page}&action=${encodeURIComponent(action)}`) });
  return <div className="space-y-2 text-sm"><input aria-label="Filter action" placeholder="Filter, e.g. user.suspend" className={`${cls} w-full`} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /><Err q={a} />
    <ul className="text-xs space-y-1">{a.data?.items.map((x) => <li key={x.id} className="rounded bg-charcoal p-2">{date(x.createdAt)} · <b>{x.action}</b> · {x.actor?.email ?? 'system'} → {x.target ?? '—'}{x.meta && <pre className="text-gray-400 overflow-x-auto">{JSON.stringify(x.meta)}</pre>}</li>)}</ul><Pager d={a.data} set={setPage} /></div>;
}

export function Admin() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') }); const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  if (me.isLoading) return <p className="p-8 text-gray-400">Loading…</p>;
  if (!me.data || !me.data.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN')) return <Navigate to="/dashboard" replace />; // convenience only; the API enforces roles
  const m = me.data;
  return <main id="main" className="min-h-screen bg-navy text-white p-4 max-w-3xl mx-auto space-y-3"><Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
    <h1 className="text-2xl font-semibold">Admin <span className="text-xs text-gray-400">{m.roles.join(', ')}</span></h1>
    <nav className="flex flex-wrap gap-1">{TABS.map((t) => <button key={t} className={`${btn} ${t === tab ? 'bg-accent/30' : ''}`} aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {tab === 'Overview' && <Overview />}{tab === 'Users' && <Users me={m} />}{tab === 'Subscriptions' && <Subs me={m} />}{tab === 'AI' && <Ai />}{tab === 'Platform' && <Platform />}{tab === 'Plans' && <Plans me={m} />}{tab === 'Support' && <Support />}{tab === 'Announcements' && <Announcements />}{tab === 'Audit' && <Audit />}</main>;
}

export function SupportForm() {
  const [f, setF] = useState({ subject: '', body: '' }); const mine = useQuery({ queryKey: ['my-support'], queryFn: () => api<any[]>('/support') }); const qc = useQueryClient();
  const send = useMutation({ mutationFn: () => api('/support', { method: 'POST', body: JSON.stringify(f) }), onSuccess: () => { setF({ subject: '', body: '' }); qc.invalidateQueries({ queryKey: ['my-support'] }); } });
  return <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-xl mx-auto space-y-3"><Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link><h1 className="text-2xl font-semibold">Contact support</h1>
    <input aria-label="Subject" placeholder="Subject" className={`${cls} w-full`} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /><textarea aria-label="Message" rows={6} placeholder="How can we help? (min 10 characters)" className={`${cls} w-full`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
    <button className="rounded bg-accent px-4 py-2 disabled:opacity-50" disabled={send.isPending || f.subject.length < 3 || f.body.length < 10} onClick={() => send.mutate()}>Send</button>{send.isSuccess && <p role="status" className="text-green-300 text-sm">Sent. We will reply here.</p>}{send.isError && <p role="alert" className="text-red-400 text-sm">Could not send (limit: 5 per hour).</p>}
    <h2 className="font-medium pt-2">Your requests</h2>{mine.data?.length === 0 && <p className="text-gray-400 text-sm">None yet.</p>}
    <ul className="text-sm space-y-1">{mine.data?.map((t) => <li key={t.id} className="rounded bg-charcoal p-2"><b>{t.subject}</b> · {t.status}{t.adminNote && <p className="text-gray-300">Reply: {t.adminNote}</p>}</li>)}</ul></main>;
}
