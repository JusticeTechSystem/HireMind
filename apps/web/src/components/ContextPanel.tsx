import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
interface Ctx { resume: { fileName: string; analyzed: boolean } | null; question: { text: string; category: string; difficulty: string | null; confidence: number } | null; skills: string[]; experience: string[]; projects: string[]; insights: { questions: number; answered: number; minutes: number; category: string | null } }
const List = ({ t, items }: { t: string; items: string[] }) => <div><h3 className="font-medium">{t}</h3>{items.length === 0 ? <p className="text-gray-400">None matched.</p> : <ul className="list-disc pl-4">{items.map((x) => <li key={x}>{x}</li>)}</ul>}</div>;
/** Right-hand panel: what in the user's own resume relates to the selected question, plus session insights. */
export function ContextPanel({ sessionId, questionId }: { sessionId: string; questionId: string | null }) {
  const q = useQuery({ queryKey: ['context', sessionId, questionId], queryFn: () => api<Ctx>(`/interviews/${sessionId}/context${questionId ? `?questionId=${questionId}` : ''}`), refetchInterval: 20_000 }); const c = q.data;
  return <section aria-label="Context and insights" className="rounded bg-charcoal p-3 min-h-[200px] text-sm space-y-3 overflow-y-auto"><h2 className="font-medium">Context</h2>
    {q.isError && <p role="alert" className="text-red-400">Could not load context.</p>}
    {c && <><p><span className="text-gray-300">Resume:</span> {c.resume ? `${c.resume.fileName}${c.resume.analyzed ? '' : ' (analysis pending)'}` : 'none selected'}</p>
      {c.question ? <div><h3 className="font-medium">Selected question</h3><p>{c.question.text}</p><p className="text-xs text-gray-300">{c.question.category} · difficulty {c.question.difficulty ?? 'n/a'}</p></div> : <p className="text-gray-400">No question yet.</p>}
      {c.resume && <><List t="Relevant experience" items={c.experience} /><List t="Relevant skills" items={c.skills} /><List t="Related projects" items={c.projects} /></>}
      <div><h3 className="font-medium">Session insights</h3><p>{c.insights.questions} questions, {c.insights.answered} answered · {c.insights.minutes} min active{c.insights.category ? ` · ${c.insights.category}` : ''}</p></div></>}</section>;
}
