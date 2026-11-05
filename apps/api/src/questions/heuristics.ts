const WH = /^(what|why|how|when|where|who|which|whose|can|could|would|should|do|does|did|is|are|was|were|have|has|will)\b/i;
const PROMPTS = /\b(tell me about|walk me through|talk me through|describe|explain|give me an example|design|implement|write (a|an|me)|how would you|what would you|let's say|imagine)\b/i;
const GREETING = /^(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening)|nice to meet|welcome|sure|okay|ok|yeah|right|great)\b[^?]*$/i;
/** Cheap gate: decides whether a transcript buffer is even worth an AI classification call. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim(); if (!t) return false;
  const words = t.split(/\s+/).length;
  if (t.endsWith('?')) return words >= 3;
  if (words < 5) return false;                // incomplete speech / filler
  if (GREETING.test(t)) return false;
  return WH.test(t) || PROMPTS.test(t);
}
const tok = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
export function similarity(a: string, b: string): number {
  const x = tok(a), y = tok(b); if (!x.size || !y.size) return 0;
  let i = 0; for (const t of x) if (y.has(t)) i++;
  return i / (x.size + y.size - i);
}
