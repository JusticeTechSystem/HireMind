import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';

const MODES = ['CONCISE', 'DETAILED', 'CONVERSATIONAL', 'STAR', 'TECHNICAL', 'BEGINNER', 'ADVANCED'] as const;
type Explanation = { summary: string; whyItWorks: string[]; risks: string[]; howToDeliver: string[] };
interface Payload { shortAnswer: string; detailedAnswer: string; keyPoints: string[]; followUps: string[]; relevantSkills: string[];
  relatedResumeExperience: { label: string; evidence: string }[]; codeExamples: { language: string; code: string; explanation: string }[];
  confidence: { level: string; notes: string }; personalExperience: { status: string; notes: string } }
interface Ans { id: string; mode: string; saved: boolean; payload: Payload; feedback?: { rating: number }[] }
interface Q { id: string; text: string; category: string; difficulty: string | null; confidence: number; source: string; answers: Ans[] }

export function AiPanel({ sessionId, onSelect, defaultMode, autoGenerate }: { sessionId: string; onSelect?: (id: string | null) => void; defaultMode?: (typeof MODES)[number]; autoGenerate?: boolean }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null); const [mode, setMode] = useState<(typeof MODES)[number]>(defaultMode ?? 'CONCISE');
  const [detailed, setDetailed] = useState(false); const [manual, setManual] = useState('');
  const qs = useQuery({ queryKey: ['questions', sessionId], queryFn: () => api<Q[]>(`/interviews/${sessionId}/questions`), refetchInterval: 15000 });
  const inv = () => qc.invalidateQueries({ queryKey: ['questions', sessionId] });
  const gen = useMutation({ mutationFn: (qid: string) => api(`/questions/${qid}/answers`, { method: 'POST', body: JSON.stringify({ mode }) }), onSuccess: inv });
  const add = useMutation({ mutationFn: (text: string) => api<Q>(`/interviews/${sessionId}/questions`, { method: 'POST', body: JSON.stringify({ text }) }), onSuccess: (q) => { setManual(''); setSel(q.id); inv(); } });
  const save = useMutation({ mutationFn: (a: Ans) => api(`/answers/${a.id}/save`, { method: 'PATCH', body: JSON.stringify({ saved: !a.saved }) }), onSuccess: inv });
  const fb = useMutation({ mutationFn: (v: { a: Ans; rating: 1 | -1 }) => (v.a.feedback?.[0]?.rating === v.rating ? api(`/answers/${v.a.id}/feedback`, { method: 'DELETE' }) : api(`/answers/${v.a.id}/feedback`, { method: 'PUT', body: JSON.stringify({ rating: v.rating }) })), onSuccess: inv });
  const q = qs.data?.find((x) => x.id === (sel ?? qs.data?.[0]?.id)); const a = q?.answers[0]; const p = a?.payload;
  const explain = useMutation({ mutationFn: (aid: string) => api<Explanation>(`/answers/${aid}/explain`, { method: 'POST' }) });
  const auto = useRef(new Set<string>());
  useEffect(() => { onSelect?.(q?.id ?? null); }, [q?.id]); // eslint-disable-line
  useEffect(() => { explain.reset(); }, [a?.id]); // eslint-disable-line
  useEffect(() => { if (autoGenerate && q && q.source === 'detected' && q.answers.length === 0 && !auto.current.has(q.id) && !gen.isPending) { auto.current.add(q.id); gen.mutate(q.id); } }, [autoGenerate, q?.id, q?.answers.length]); // eslint-disable-line
  const btn = 'rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-40';
  return (
    <section aria-label="AI assistant" className="rounded bg-charcoal p-3 min-h-[200px] flex flex-col gap-2 text-sm overflow-y-auto">
      <h2 className="font-medium">AI assistant</h2>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (manual.trim().length >= 3) add.mutate(manual.trim()); }}>
        <input aria-label="Add question manually" placeholder="Type a question…" value={manual} onChange={(e) => setManual(e.target.value)} className="flex-1 rounded bg-navy p-1" />
        <button className={btn} disabled={add.isPending}>Add</button></form>
      {qs.isLoading && <p className="text-gray-400">Loading…</p>}
      {qs.isError && <p role="alert" className="text-red-400">Could not load questions.</p>}
      {qs.data?.length === 0 && <p className="text-gray-400">No questions yet. Interviewer questions are detected from system audio, or add one above.</p>}
      <div className="flex gap-1 overflow-x-auto">{qs.data?.map((x) => (
        <button key={x.id} onClick={() => setSel(x.id)} className={`${btn} whitespace-nowrap max-w-[14rem] truncate ${x.id === q?.id ? 'bg-accent/30' : ''}`}>{x.text}</button>))}</div>
      {q && <div className="space-y-2">
        <p className="font-medium">{q.text}</p>
        <p className="text-xs text-gray-400">{q.category} · {q.difficulty ?? '—'} · {q.source}{q.source === 'detected' ? ` · ${(q.confidence * 100).toFixed(0)}%` : ''}</p>
        <div className="flex flex-wrap gap-1 items-center">
          <select aria-label="Answer mode" value={mode} onChange={(e) => setMode(e.target.value as never)} className="bg-navy rounded p-1 text-xs">{MODES.map((m) => <option key={m}>{m}</option>)}</select>
          <button className={btn} disabled={gen.isPending} onClick={() => gen.mutate(q.id)}>{gen.isPending ? 'Generating…' : a ? 'Regenerate' : 'Generate answer'}</button>
        </div>
        {gen.isError && <p role="alert" className="text-red-400 text-xs">Could not generate an answer (AI may not be configured, or returned invalid output).</p>}
        {p && a && <article className="space-y-2">
          <div className="flex flex-wrap gap-1"><button className={btn} onClick={() => setDetailed(!detailed)}>{detailed ? 'Show short' : 'Show detailed'}</button>
            <button className={btn} onClick={() => navigator.clipboard.writeText(detailed ? p.detailedAnswer : p.shortAnswer)}>Copy</button>
            <button className={btn} onClick={() => save.mutate(a)}>{a.saved ? 'Unsave' : 'Save'}</button>
            <button className={btn} aria-label="Mark answer helpful" aria-pressed={a.feedback?.[0]?.rating === 1} onClick={() => fb.mutate({ a, rating: 1 })}>👍</button>
            <button className={btn} aria-label="Mark answer not helpful" aria-pressed={a.feedback?.[0]?.rating === -1} onClick={() => fb.mutate({ a, rating: -1 })}>👎</button>
            <button className={btn} disabled={explain.isPending} onClick={() => explain.mutate(a.id)}>{explain.isPending ? 'Explaining…' : 'Explain answer'}</button></div>
          {explain.isError && <p role="alert" className="text-red-400 text-xs">Could not explain this answer.</p>}
          {explain.data && <div className="rounded bg-navy p-2 text-xs space-y-1"><p>{explain.data.summary}</p>
            {explain.data.whyItWorks.length > 0 && <div><b>Why it works</b><ul className="list-disc pl-4">{explain.data.whyItWorks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {explain.data.risks.length > 0 && <div><b>Watch out for</b><ul className="list-disc pl-4">{explain.data.risks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {explain.data.howToDeliver.length > 0 && <div><b>Delivery tips</b><ul className="list-disc pl-4">{explain.data.howToDeliver.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}</div>}
          <p className="whitespace-pre-wrap">{detailed ? p.detailedAnswer : p.shortAnswer}</p>
          <p className={`text-xs ${p.personalExperience.status === 'verified' ? 'text-green-400' : 'text-amber-400'}`}>
            {p.personalExperience.status === 'verified' ? 'Backed by your resume' : p.personalExperience.status === 'suggested_example' ? 'Suggested example — not from your resume. Do not present as your own experience.' : 'Conceptual answer'}
            {p.personalExperience.notes && ` — ${p.personalExperience.notes}`}</p>
          <p className="text-xs text-gray-400">Confidence: {p.confidence.level}{p.confidence.notes && ` — ${p.confidence.notes}`}</p>
          {p.keyPoints.length > 0 && <ul className="list-disc pl-4">{p.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>}
          {p.relatedResumeExperience.length > 0 && <div><b className="text-xs">From your resume</b>{p.relatedResumeExperience.map((r, i) => <p key={i} className="text-xs text-gray-300">{r.label}{r.evidence && ` — ${r.evidence}`}</p>)}</div>}
          {p.codeExamples.map((c, i) => <div key={i}><pre className="bg-navy rounded p-2 overflow-x-auto text-xs"><code>{c.code}</code></pre><p className="text-xs text-gray-400">{c.language}: {c.explanation}</p></div>)}
          {p.followUps.length > 0 && <div><b className="text-xs">Likely follow-ups</b><ul className="list-disc pl-4 text-xs">{p.followUps.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
        </article>}
      </div>}
    </section>
  );
}
