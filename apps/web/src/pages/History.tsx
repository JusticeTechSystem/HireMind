import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/auth';

const cls = 'rounded bg-charcoal border border-white/10 p-2 text-sm';
const btn = 'rounded border border-white/20 px-3 py-1 text-sm disabled:opacity-40';
interface S { id: string; title: string; status: string; category: string | null; createdAt: string; activeMs: number }
const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function History() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [sp, setSp] = useState(1);
  const list = useQuery({ queryKey: ['history', q, status, page], queryFn: () => api<{ items: S[]; total: number; pageSize: number }>(`/interviews?page=${page}&q=${encodeURIComponent(q)}&status=${status}`) });
  const saved = useQuery({ queryKey: ['saved', sp], queryFn: () => api<{ items: { id: string; question: { text: string; sessionId: string }; payload: { shortAnswer: string } }[]; total: number; pageSize: number }>(`/answers/saved?page=${sp}`) });
  const pages = (n?: number, size = 20) => Math.max(1, Math.ceil((n ?? 0) / size));
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-2xl mx-auto space-y-3">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold">Interview history</h1>
      <div className="flex gap-2"><input aria-label="Search sessions" placeholder="Search title…" className={`${cls} flex-1`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select aria-label="Status filter" className={cls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['CREATED', 'ACTIVE', 'PAUSED', 'COMPLETED'].map((x) => <option key={x}>{x}</option>)}</select></div>
      {list.isLoading && <p className="text-gray-400">Loading…</p>}{list.isError && <p role="alert" className="text-red-400">Could not load history.</p>}
      {list.data?.items.length === 0 && <p className="text-gray-400">No sessions match.</p>}
      <ul className="space-y-1">{list.data?.items.map((s) => <li key={s.id} className="rounded bg-charcoal p-3"><Link className="underline" to={`/history/${s.id}`}>{s.title}</Link>
        <span className="text-xs text-gray-400"> · {s.status} · {new Date(s.createdAt).toLocaleDateString()} · {fmt(s.activeMs)}</span></li>)}</ul>
      <div className="flex gap-2 items-center"><button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span className="text-sm">Page {page} / {pages(list.data?.total, list.data?.pageSize)}</span>
        <button className={btn} disabled={page >= pages(list.data?.total, list.data?.pageSize)} onClick={() => setPage(page + 1)}>Next</button></div>
      <h2 className="font-medium pt-4">Saved answers</h2>
      {saved.data?.items.length === 0 && <p className="text-gray-400 text-sm">Nothing saved yet.</p>}
      <ul className="space-y-2 text-sm">{saved.data?.items.map((a) => <li key={a.id} className="rounded bg-charcoal p-3"><b>{a.question.text}</b><p className="text-gray-300 mt-1">{a.payload.shortAnswer}</p></li>)}</ul>
      {(saved.data?.total ?? 0) > (saved.data?.pageSize ?? 20) && <div className="flex gap-2"><button className={btn} disabled={sp <= 1} onClick={() => setSp(sp - 1)}>Prev</button><button className={btn} disabled={sp >= pages(saved.data?.total, saved.data?.pageSize)} onClick={() => setSp(sp + 1)}>Next</button></div>}
    </main>
  );
}

interface Detail { session: S & { summary: { overview: string; keyTopics: string[]; strengths: string[]; improvements: string[] } | null }; transcriptCount: number;
  questions: { id: string; text: string; category: string; answers: { payload: { shortAnswer: string } }[] }[] }
export function HistoryDetail() {
  const { id } = useParams(); const nav = useNavigate(); const qc = useQueryClient(); const [tp, setTp] = useState(1);
  const d = useQuery({ queryKey: ['hd', id], queryFn: () => api<Detail>(`/interviews/${id}/detail`) });
  const tr = useQuery({ queryKey: ['hdt', id, tp], queryFn: () => api<{ items: { id: string; source: string; offsetMs: number; text: string }[] }>(`/interviews/${id}/transcripts?page=${tp}`) });
  const inv = () => { qc.invalidateQueries({ queryKey: ['hd', id] }); qc.invalidateQueries({ queryKey: ['hdt', id] }); };
  const sum = useMutation({ mutationFn: () => api(`/interviews/${id}/summary`, { method: 'POST' }), onSuccess: inv });
  const delTr = useMutation({ mutationFn: () => api(`/interviews/${id}/transcripts`, { method: 'DELETE' }), onSuccess: inv });
  const delS = useMutation({ mutationFn: () => api(`/interviews/${id}`, { method: 'DELETE' }), onSuccess: () => nav('/history') });
  const pdf = async () => { const r = await fetch(`/api/v1/interviews/${id}/export.pdf`, { headers: { Authorization: `Bearer ${useAuth.getState().session?.access_token}` } });
    if (!r.ok) return alert('Export failed'); const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `session-${id}.pdf`; a.click(); };
  const x = d.data; if (d.isLoading) return <p className="p-8 text-gray-400">Loading…</p>; if (!x) return <p role="alert" className="p-8 text-red-400">Session not found.</p>;
  const s = x.session;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-2xl mx-auto space-y-3">
      <Link to="/history" className="text-sm text-gray-400 underline">← History</Link>
      <h1 className="text-2xl font-semibold">{s.title}</h1><p className="text-xs text-gray-400">{s.status} · {new Date(s.createdAt).toLocaleString()} · {fmt(s.activeMs)} active</p>
      <div className="flex flex-wrap gap-2"><button className={btn} onClick={pdf}>Export PDF</button>
        <button className={btn} disabled={s.status !== 'COMPLETED' || sum.isPending} onClick={() => sum.mutate()}>{sum.isPending ? 'Summarising…' : s.summary ? 'Regenerate summary' : 'Generate summary'}</button>
        <button className={`${btn} text-red-300`} disabled={!x.transcriptCount} onClick={() => confirm('Delete this session’s transcript permanently?') && delTr.mutate()}>Delete transcript</button>
        <button className={`${btn} text-red-300`} onClick={() => confirm('Delete this session and everything in it?') && delS.mutate()}>Delete session</button></div>
      {sum.isError && <p role="alert" className="text-red-400 text-sm">Could not summarise (AI may not be configured).</p>}
      {s.summary && <section className="rounded bg-charcoal p-3 text-sm space-y-1"><h2 className="font-medium">Summary</h2><p>{s.summary.overview}</p>
        {s.summary.keyTopics.length > 0 && <p><b>Topics:</b> {s.summary.keyTopics.join(', ')}</p>}{s.summary.strengths.length > 0 && <p className="text-green-300">+ {s.summary.strengths.join('; ')}</p>}{s.summary.improvements.length > 0 && <p className="text-amber-300">→ {s.summary.improvements.join('; ')}</p>}</section>}
      <section><h2 className="font-medium">Questions ({x.questions.length})</h2>{x.questions.length === 0 && <p className="text-gray-400 text-sm">None recorded.</p>}
        <ul className="space-y-2 text-sm">{x.questions.map((q) => <li key={q.id} className="rounded bg-charcoal p-3"><b>{q.text}</b>{q.answers[0] && <p className="text-gray-300 mt-1">{q.answers[0].payload.shortAnswer}</p>}</li>)}</ul></section>
      <section><h2 className="font-medium">Transcript ({x.transcriptCount})</h2>{tr.data?.items.length === 0 && <p className="text-gray-400 text-sm">No transcript.</p>}
        <div className="text-sm space-y-1">{tr.data?.items.map((l) => <p key={l.id}><span className="text-gray-400">{fmt(l.offsetMs)} {l.source === 'MICROPHONE' ? 'You' : 'Interviewer'}: </span>{l.text}</p>)}</div>
        {x.transcriptCount > 200 && <div className="flex gap-2 mt-2"><button className={btn} disabled={tp <= 1} onClick={() => setTp(tp - 1)}>Prev</button><button className={btn} disabled={tp * 200 >= x.transcriptCount} onClick={() => setTp(tp + 1)}>Next</button></div>}</section>
    </main>
  );
}
