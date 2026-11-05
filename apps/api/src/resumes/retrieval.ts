import type { ResumeProfile } from '@justiceview/validation';
const tok = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
export interface ContextItem { kind: 'employment' | 'project' | 'skill'; label: string; score: number }
/** Keyword-overlap retrieval over the structured profile. Deterministic; no model call. */
export function retrieveContext(profile: ResumeProfile, question: string, limit = 5): ContextItem[] {
  const q = tok(question); const items: ContextItem[] = [];
  const score = (text: string) => { let n = 0; for (const t of tok(text)) if (q.has(t)) n++; return n; };
  for (const e of profile.employment) items.push({ kind: 'employment', label: `${e.role} at ${e.company}`, score: score(`${e.role} ${e.company} ${e.highlights.join(' ')}`) });
  for (const p of profile.projects) items.push({ kind: 'project', label: p.name, score: score(`${p.name} ${p.description} ${p.technologies.join(' ')}`) });
  for (const s of [...profile.skills, ...profile.technologies]) items.push({ kind: 'skill', label: s, score: score(s) * 2 });
  return items.filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
