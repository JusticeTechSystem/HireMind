import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { useTheme } from '../lib/theme';

const LANGS = [['javascript', 'JavaScript', 'javascript'], ['typescript', 'TypeScript', 'typescript'], ['react', 'React', 'typescript'], ['node', 'Node.js', 'javascript'],
  ['python', 'Python', 'python'], ['java', 'Java', 'java'], ['cpp', 'C++', 'cpp'], ['sql', 'SQL', 'sql'], ['go', 'Go', 'go']] as const;
const MODES = ['solve', 'debug', 'optimize', 'explain'] as const;
const btn = 'rounded border border-white/20 px-3 py-1 text-sm disabled:opacity-40';
const cls = 'w-full rounded bg-charcoal border border-white/10 p-2';

function Code({ value, onChange, language, readOnly, height = 260, editorRef }: { value: string; onChange?: (v: string) => void; language: string; readOnly?: boolean; height?: number; editorRef?: React.MutableRefObject<any> }) {
  const light = useTheme((s) => s.resolved) === 'light';
  return <Editor height={height} theme={light ? 'light' : 'vs-dark'} language={language} value={value} onChange={(v) => onChange?.(v ?? '')} onMount={(e) => { if (editorRef) editorRef.current = e; }}
    options={{ readOnly, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: 'on' }} />;
}
interface CodingRes { problemUnderstanding: string; approach: string; code: string; steps: string[]; timeComplexity: string; spaceComplexity: string; edgeCases: string[]; testCases: { input: string; expected: string }[] }

export function CodingAssistant() {
  const [lang, setLang] = useState<(typeof LANGS)[number][0]>('python'); const [mode, setMode] = useState<(typeof MODES)[number]>('solve');
  const [prompt, setPrompt] = useState(''); const [code, setCode] = useState(''); const ed = useRef<any>(null);
  const monaco = LANGS.find((l) => l[0] === lang)![2];
  const run = useMutation({ mutationFn: () => api<CodingRes>('/coding/solve', { method: 'POST', body: JSON.stringify({ language: lang, mode, prompt, code: code || undefined }) }) });
  const r = run.data;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-4 max-w-3xl mx-auto space-y-3">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold">Coding assistant</h1>
      <div className="flex gap-2"><select aria-label="Language" className={cls} value={lang} onChange={(e) => setLang(e.target.value as never)}>{LANGS.map((l) => <option key={l[0]} value={l[0]}>{l[1]}</option>)}</select>
        <select aria-label="Mode" className={cls} value={mode} onChange={(e) => setMode(e.target.value as never)}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
      <textarea aria-label="Problem" className={cls} rows={4} placeholder="Describe the problem, bug or question…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="flex gap-2 text-sm"><span className="flex-1 text-gray-400">Your code (optional for solve)</span>
        <button className={btn} onClick={() => ed.current?.getAction('editor.action.formatDocument')?.run()}>Format</button>
        <button className={btn} onClick={() => setCode('')}>Reset</button><button className={btn} onClick={() => navigator.clipboard.writeText(code)}>Copy</button></div>
      <Code value={code} onChange={setCode} language={monaco} editorRef={ed} height={200} />
      <p className="text-xs text-gray-400">Code is never executed; the assistant only writes and explains it.</p>
      <button className="rounded bg-accent px-4 py-2 disabled:opacity-50" disabled={run.isPending || prompt.trim().length < 5} onClick={() => run.mutate()}>{run.isPending ? 'Thinking…' : 'Ask'}</button>
      {run.isError && <p role="alert" className="text-red-400 text-sm">Request failed (AI may not be configured).</p>}
      {r && <article className="space-y-3 text-sm">
        <section><h2 className="font-medium">Problem understanding</h2><p>{r.problemUnderstanding}</p></section>
        <section><h2 className="font-medium">Approach</h2><p>{r.approach}</p></section>
        <section><div className="flex"><h2 className="font-medium flex-1">Code</h2><button className={btn} onClick={() => navigator.clipboard.writeText(r.code)}>Copy</button></div><Code value={r.code} language={monaco} readOnly height={280} /></section>
        <section><h2 className="font-medium">Explanation</h2><ol className="list-decimal pl-5">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></section>
        <p><b>Time:</b> {r.timeComplexity} · <b>Space:</b> {r.spaceComplexity}</p>
        {r.edgeCases.length > 0 && <section><h2 className="font-medium">Edge cases</h2><ul className="list-disc pl-5">{r.edgeCases.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}
        {r.testCases.length > 0 && <section><h2 className="font-medium">Test cases</h2><ul>{r.testCases.map((t, i) => <li key={i}><code>{t.input}</code> → <code>{t.expected}</code></li>)}</ul></section>}
      </article>}
    </main>
  );
}

interface Design { functionalRequirements: string[]; nonFunctionalRequirements: string[]; highLevelArchitecture: string; lowLevelDesign: string; databaseDesign: string; apiDesign: string;
  scalability: string[]; caching: string[]; loadBalancing: string[]; messageQueues: string[]; microservices: string[]; security: string[]; reliability: string[];
  tradeoffs: { decision: string; pros: string[]; cons: string[] }[]; mermaid: string }
function Diagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null); const [err, setErr] = useState(false);
  useEffect(() => { let off = false; setErr(false);
    import('mermaid').then(async ({ default: m }) => { m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
      const { svg } = await m.render('d' + Math.random().toString(36).slice(2), code); if (!off && ref.current) ref.current.innerHTML = svg; }).catch(() => !off && setErr(true));
    return () => { off = true; }; }, [code]);
  return err ? <pre className="bg-charcoal p-2 rounded text-xs overflow-x-auto">{code}</pre> : <div ref={ref} className="overflow-x-auto bg-charcoal rounded p-2" />;
}
const List = ({ t, items }: { t: string; items: string[] }) => items.length ? <section><h2 className="font-medium">{t}</h2><ul className="list-disc pl-5">{items.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null;
const Text = ({ t, v }: { t: string; v: string }) => v ? <section><h2 className="font-medium">{t}</h2><p className="whitespace-pre-wrap">{v}</p></section> : null;

export function SystemDesign() {
  const [prompt, setPrompt] = useState('');
  const run = useMutation({ mutationFn: () => api<Design>('/system-design', { method: 'POST', body: JSON.stringify({ prompt }) }) });
  const d = run.data;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-4 max-w-3xl mx-auto space-y-3">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold">System design assistant</h1>
      <textarea aria-label="Design problem" className={cls} rows={4} placeholder="e.g. Design a URL shortener handling 100M links/day" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button className="rounded bg-accent px-4 py-2 disabled:opacity-50" disabled={run.isPending || prompt.trim().length < 10} onClick={() => run.mutate()}>{run.isPending ? 'Designing…' : 'Generate design'}</button>
      {run.isError && <p role="alert" className="text-red-400 text-sm">Request failed (AI may not be configured).</p>}
      {d && <article className="space-y-3 text-sm">
        {d.mermaid && <Diagram code={d.mermaid} />}
        <List t="Functional requirements" items={d.functionalRequirements} /><List t="Non-functional requirements" items={d.nonFunctionalRequirements} />
        <Text t="High-level architecture" v={d.highLevelArchitecture} /><Text t="Low-level design" v={d.lowLevelDesign} /><Text t="Database design" v={d.databaseDesign} /><Text t="API design" v={d.apiDesign} />
        <List t="Scalability" items={d.scalability} /><List t="Caching" items={d.caching} /><List t="Load balancing" items={d.loadBalancing} /><List t="Message queues" items={d.messageQueues} />
        <List t="Microservices" items={d.microservices} /><List t="Security" items={d.security} /><List t="Reliability" items={d.reliability} />
        {d.tradeoffs.length > 0 && <section><h2 className="font-medium">Trade-offs</h2>{d.tradeoffs.map((t, i) => <p key={i}><b>{t.decision}:</b> + {t.pros.join('; ')} / − {t.cons.join('; ')}</p>)}</section>}
      </article>}
    </main>
  );
}
