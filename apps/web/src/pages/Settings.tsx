import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/auth';
import { ThemeToggle } from '../components/ThemeToggle';

const btn = 'rounded border border-white/20 px-3 py-1 text-sm disabled:opacity-40';
const box = 'rounded bg-charcoal p-4 space-y-2';
interface Sess { id: string; userAgent: string | null; ipPrefix: string | null; lastSeenAt: string; current: boolean }
const RETENTION = [['', 'Keep until I delete them'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year']] as const;

export function Settings() {
  const nav = useNavigate(); const qc = useQueryClient(); const signOut = useAuth((s) => s.signOut); const email = useAuth((s) => s.session?.user.email);
  const [confirm, setConfirm] = useState(''); const file = useRef<HTMLInputElement>(null);
  const prof = useQuery({ queryKey: ['profile'], queryFn: () => api<{ profile: { retentionDays: number | null } | null }>('/profiles/me') });
  const avatar = useQuery({ queryKey: ['avatar'], queryFn: () => api<{ url: string | null }>('/profiles/me/avatar'), retry: false });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Sess[]>('/sessions') });
  const upload = useMutation({ mutationFn: async (f: File) => { const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/v1/profiles/me/avatar', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${useAuth.getState().session?.access_token}` } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `Upload failed (${r.status})`); }, onSuccess: () => qc.invalidateQueries({ queryKey: ['avatar'] }) });
  const rmAvatar = useMutation({ mutationFn: () => api('/profiles/me/avatar', { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['avatar'] }) });
  const retention = useMutation({ mutationFn: (days: number | null) => api('/profiles/me/retention', { method: 'PUT', body: JSON.stringify({ days }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }) });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/sessions/${id}/revoke`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const revokeOthers = useMutation({ mutationFn: () => api('/sessions/revoke-others', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const exp = useMutation({ mutationFn: async () => { const d = await api<unknown>('/account/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'hiremind-export.json'; a.click(); } });
  const del = useMutation({ mutationFn: () => api('/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }), onSuccess: async () => { await signOut(); nav('/'); } });
  const days = prof.data?.profile?.retentionDays ?? null;
  return <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-xl mx-auto space-y-4"><Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link><h1 className="text-2xl font-semibold">Settings</h1><p className="text-sm text-gray-400">Signed in as {email}</p>
    <section aria-labelledby="s-profile" className={box}><h2 id="s-profile" className="font-medium">Profile picture</h2>
      <div className="flex items-center gap-3">{avatar.data?.url ? <img src={avatar.data.url} alt="Your avatar" width={64} height={64} className="rounded-full object-cover w-16 h-16" /> : <span aria-hidden="true" className="w-16 h-16 rounded-full bg-accent grid place-items-center text-xl">{(email ?? '?')[0].toUpperCase()}</span>}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Choose profile picture" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        <button className={btn} disabled={upload.isPending} onClick={() => file.current?.click()}>{upload.isPending ? 'Uploading…' : 'Upload (PNG, JPEG, WebP, max 2 MB)'}</button>
        {avatar.data?.url && <button className={btn} onClick={() => rmAvatar.mutate()}>Remove</button>}</div>
      {upload.isError && <p role="alert" className="text-red-400 text-sm">{(upload.error as Error).message}</p>}</section>
    <section aria-labelledby="s-theme" className={box}><h2 id="s-theme" className="font-medium">Appearance</h2><ThemeToggle /></section>
    <section aria-labelledby="s-ret" className={box}><h2 id="s-ret" className="font-medium">Transcript retention</h2><p className="text-sm text-gray-300">Automatically delete the text of your transcripts after this period. Sessions, questions, answers and summaries are kept.</p>
      <label className="text-sm">Delete transcripts after <select className="rounded bg-navy border border-white/10 p-1" value={days === null ? '' : String(days)} onChange={(e) => retention.mutate(e.target.value ? Number(e.target.value) : null)}>{RETENTION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {retention.isSuccess && <p role="status" className="text-green-300 text-sm">Saved.</p>}{retention.isError && <p role="alert" className="text-red-400 text-sm">Could not save.</p>}</section>
    <section aria-labelledby="s-sess" className={box}><h2 id="s-sess" className="font-medium">Active sessions</h2><p className="text-sm text-gray-300">Devices signed in to your account in the last 30 days. Revoking one signs it out of HireMind immediately.</p>
      {sessions.data?.length === 0 && <p className="text-sm text-gray-400">No tracked sessions yet.</p>}
      <ul className="space-y-1 text-sm">{sessions.data?.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-2"><span className="flex-1 truncate">{s.userAgent ?? 'Unknown device'} · {s.ipPrefix ?? 'ip n/a'} · {new Date(s.lastSeenAt).toLocaleString()}{s.current && <b className="ml-1 text-accent-text">This device</b>}</span>
        {!s.current && <button className={btn} onClick={() => revoke.mutate(s.id)}>Revoke</button>}</li>)}</ul>
      {(sessions.data?.length ?? 0) > 1 && <button className={btn} disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>Sign out all other devices</button>}</section>
    <section aria-labelledby="s-data" className={box}><h2 id="s-data" className="font-medium">Your data</h2><p className="text-sm text-gray-300">Download everything we hold about you (profile, resumes and extracted text, sessions, transcripts, answers and ratings, mock interviews, payments) as JSON.</p>
      <button className={btn} disabled={exp.isPending} onClick={() => exp.mutate()}>{exp.isPending ? 'Preparing…' : 'Download my data'}</button>{exp.isError && <p role="alert" className="text-red-400 text-sm">Export failed (limit: 3 per hour).</p>}</section>
    <section aria-labelledby="s-del" className={`${box} border border-red-500/40`}><h2 id="s-del" className="font-medium text-red-300">Delete account</h2><p className="text-sm text-gray-300">Permanently deletes your account and all data, and cancels any active subscription. This cannot be undone.</p>
      <input aria-label="Type DELETE to confirm" placeholder="Type DELETE to confirm" className="rounded bg-navy border border-white/10 p-1 text-sm w-full" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button className={`${btn} text-red-300`} disabled={confirm !== 'DELETE' || del.isPending} onClick={() => del.mutate()}>{del.isPending ? 'Deleting…' : 'Delete my account'}</button>{del.isError && <p role="alert" className="text-red-400 text-sm">Deletion failed and nothing was removed. Please retry.</p>}</section></main>;
}
