// WCAG 2.1 contrast check for the app's real theme tokens (see apps/web/src/index.css). Run: node scripts/contrast-check.mjs
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const T = {
  dark: { bg: { navy: '#0b1020', charcoal: '#14172a' }, fg: { 'text-white': '#ffffff', 'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'accent-text': '#a78bfa', 'green-300': '#86efac', 'red-300': '#fca5a5', 'red-400': '#f87171', 'amber-200': '#fde68a', 'amber-300': '#fcd34d' } },
  light: { bg: { navy: '#f6f7fb', charcoal: '#ffffff' }, fg: { 'text-white→ink': '#0f172a', 'gray-300→': '#334155', 'gray-400→': '#475569', 'accent-text': '#6d28d9', 'green': '#15803d', 'red': '#b91c1c', 'amber': '#92400e' } },
};
const pairs = [['white on accent button', '#ffffff', '#7c3aed'], ['black on amber banner', '#000000', '#f59e0b']];
let fail = 0;
for (const [theme, t] of Object.entries(T)) for (const [bn, b] of Object.entries(t.bg)) for (const [fn, f] of Object.entries(t.fg)) { const r = ratio(f, b); const ok = r >= 4.5; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${theme} ${fn} on ${bn}: ${r.toFixed(2)}:1`); }
for (const [n, f, b] of pairs) { const r = ratio(f, b); const ok = r >= 4.5; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}: ${r.toFixed(2)}:1`); }
console.log(fail ? `${fail} pairs below 4.5:1` : 'all pairs >= 4.5:1'); process.exit(fail ? 1 : 0);
