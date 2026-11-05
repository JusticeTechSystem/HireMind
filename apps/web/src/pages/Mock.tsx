import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';

const cls = 'w-full rounded bg-charcoal border border-white/10 p-2';
const DIMS = ['relevance', 'technicalCorrectness', 'completeness', 'clarity', 'communication', 'structure'];
interface Resp { scores: Record<string, number>; feedback: { strengths: string[]; improvements: string[]; idealAnswerOutline: string } }
interface MQ { id: string; idx: number; text: string; topic: string; response: Resp | null }
interface Mock { id: string; durationMin: number; createdAt: string; jobTitle: string; status: string; overallScore: number | null; questions: MQ[]; summary?: { dimensionAverages: Record<string, number>; answered: number; total: number } }

export function MockList() {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['mocks', page], queryFn: () => api<{ items: { id: string; jobTitle: string; status: string; overallScore: number | null; createdAt: string }[]; total: number; pageSize: number }>(`/mock-interviews?page=${page}`) });
  const [f, setF] = useState({ category: 'mixed', jobTitle: '', level: 'mid', difficulty: 'medium', durationMin: 30, numQuestions: 5 });
  const create = useMutation({ mutationFn: () => api<{ id: string }>('/mock-interviews', { method: 'POST', body: JSON.stringify(f) }), onSuccess: (m) => nav(`/mock/${m.id}`) });
  const sel = (k: keyof typeof f, opts: string[]) => <select aria-label={k} className={cls} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-md mx-auto space-y-3">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold">Mock interviews</h1>
      <input aria-label="Job title" placeholder="Job title" className={cls} value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} />
      {sel('category', ['mixed', 'technical', 'behavioral', 'system-design', 'coding'])}{sel('level', ['student', 'junior', 'mid', 'senior', 'lead'])}{sel('difficulty', ['easy', 'medium', 'hard'])}
      <label className="block text-sm">Duration (min)<input type="number" min={5} max={120} className={cls} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: +e.target.value })} /></label>
      <label className="block text-sm">Questions (1–15)<input type="number" min={1} max={15} className={cls} value={f.numQuestions} onChange={(e) => setF({ ...f, numQuestions: +e.target.value })} /></label>
      <button className="w-full rounded bg-accent p-2 disabled:opacity-50" disabled={create.isPending || f.jobTitle.trim().length < 2} onClick={() => create.mutate()}>{create.isPending ? 'Generating questions…' : 'Start mock interview'}</button>
      {create.isError && <p role="alert" className="text-red-400 text-sm">Could not start (AI may not be configured).</p>}
      <h2 className="font-medium pt-3">History</h2>
      {list.data?.items.length === 0 && <p className="text-gray-400 text-sm">No mock interviews yet.</p>}
      <ul className="space-y-1">{list.data?.items.map((m) => <li key={m.id}><Link to={`/mock/${m.id}`} className="underline">{m.jobTitle}</Link> · {m.status === 'COMPLETED' ? `${m.overallScore}/100` : 'in progress'}</li>)}</ul>
      <div className="flex gap-2 items-center text-sm"><button className="rounded border border-white/20 px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page}</span><button className="rounded border border-white/20 px-2 py-1 disabled:opacity-40" disabled={page * (list.data?.pageSize ?? 20) >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</button></div>
    </main>
  );
}

export function MockSession() {
  const { id } = useParams(); const qc = useQueryClient();
  const [text, setText] = useState(''); const [listening, setListening] = useState(false); const rec = useRef<any>(null);
  const q = useQuery({ queryKey: ['mock', id], queryFn: () => api<Mock>(`/mock-interviews/${id}`) });
  const inv = () => qc.invalidateQueries({ queryKey: ['mock', id] });
  const answer = useMutation({ mutationFn: (qid: string) => api(`/mock-interviews/${id}/questions/${qid}/answer`, { method: 'POST', body: JSON.stringify({ answerText: text }) }), onSuccess: () => { setText(''); inv(); } });
  const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const finish = useMutation({ mutationFn: () => api(`/mock-interviews/${id}/complete`, { method: 'POST' }), onSuccess: inv });
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  const dictate = () => {
    if (listening) { rec.current?.stop(); return; }
    if (!confirm('Dictation uses your browser’s speech service (e.g. Google/Apple), not JusticeView. Continue?')) return;
    const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = 'en-US';
    r.onresult = (e: any) => setText((t) => (t + ' ' + Array.from(e.results).slice(e.resultIndex).map((x: any) => x[0].transcript).join(' ')).trim());
    r.onend = () => setListening(false); r.onerror = () => setListening(false); rec.current = r; r.start(); setListening(true);
  };
  const m = q.data; if (q.isLoading) return <p className="p-8 text-gray-400">Loading…</p>; if (!m) return <p role="alert" className="p-8 text-red-400">Not found.</p>;
  const left = m.durationMin * 60_000 - (now - new Date(m.createdAt).getTime()); const timeUp = left <= 0 && m.status !== 'COMPLETED';
  const clock = `${String(Math.max(0, Math.floor(left / 60000))).padStart(2, '0')}:${String(Math.max(0, Math.floor(left / 1000) % 60)).padStart(2, '0')}`;
  const next = m.questions.find((x) => !x.response); const done = m.status === 'COMPLETED'; const last = m.questions.filter((x) => x.response).slice(-1)[0];
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-xl mx-auto space-y-3">
      <Link to="/mock" className="text-sm text-gray-400 underline">← Mock interviews</Link>
      <h1 className="text-2xl font-semibold">{m.jobTitle}</h1>
      {m.status !== 'COMPLETED' && <p role="timer" aria-label="Time remaining" className={`text-sm ${timeUp ? 'text-red-400' : 'text-gray-300'}`}>{timeUp ? 'Time is up: finish to see your score.' : `Time left ${clock}`}</p>}
      {done ? <section><p className="text-3xl">{m.overallScore}/100</p><p className="text-sm text-gray-400">{m.summary?.answered}/{m.summary?.total} questions answered</p>
        <ul className="text-sm">{DIMS.map((d) => <li key={d}>{d}: {m.summary?.dimensionAverages[d]}/10</li>)}</ul></section> : next ? <section className="space-y-2">
        <p className="text-xs text-gray-400">Question {next.idx + 1} of {m.questions.length}</p><p className="font-medium">{next.text}</p>
        <textarea aria-label="Your answer" rows={6} className={cls} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2"><button className="rounded bg-accent px-4 py-2 disabled:opacity-50" disabled={answer.isPending || timeUp || text.trim().length < 5} onClick={() => answer.mutate(next.id)}>{answer.isPending ? 'Evaluating…' : 'Submit answer'}</button>
          {SR ? <button className="rounded border border-white/20 px-3" onClick={dictate}>{listening ? 'Stop dictation' : 'Dictate'}</button> : <span className="text-xs text-gray-400 self-center">Dictation unsupported in this browser</span>}</div>
        {answer.isError && <p role="alert" className="text-red-400 text-sm">Could not evaluate (AI may not be configured).</p>}</section>
        : <button className="rounded bg-accent px-4 py-2" onClick={() => finish.mutate()}>Finish and score</button>}
      {!done && next && m.questions.some((x) => x.response) && <button className="underline text-sm" onClick={() => finish.mutate()}>Finish early</button>}
      {finish.isError && <p role="alert" className="text-red-400 text-sm">Answer at least one question first.</p>}
      {last?.response && !done && <section className="text-sm rounded bg-charcoal p-3 space-y-1"><b>Feedback on previous answer</b>
        <p>{DIMS.map((d) => `${d} ${last.response!.scores[d]}`).join(' · ')}</p>
        <p className="text-green-300">+ {last.response.feedback.strengths.join('; ')}</p><p className="text-amber-300">→ {last.response.feedback.improvements.join('; ')}</p></section>}
      {done && m.questions.map((x) => x.response && <section key={x.id} className="text-sm rounded bg-charcoal p-3 space-y-1"><b>{x.text}</b>
        <p className="text-green-300">+ {x.response.feedback.strengths.join('; ')}</p><p className="text-amber-300">→ {x.response.feedback.improvements.join('; ')}</p>
        {x.response.feedback.idealAnswerOutline && <p className="text-gray-300">Ideal outline: {x.response.feedback.idealAnswerOutline}</p>}</section>)}
    </main>
  );
}
