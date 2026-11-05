import { create } from 'zustand';
export type Pref = 'system' | 'light' | 'dark';
const KEY = 'hm-theme';
const read = (): Pref => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } };
const systemLight = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
export const resolve = (p: Pref): 'light' | 'dark' => (p === 'system' ? (systemLight() ? 'light' : 'dark') : p);
const apply = (r: 'light' | 'dark') => { if (typeof document !== 'undefined') document.documentElement.dataset.theme = r; };

export const useTheme = create<{ pref: Pref; resolved: 'light' | 'dark'; set: (p: Pref) => void }>((set) => {
  const pref = read(); const resolved = resolve(pref); apply(resolved);
  return { pref, resolved, set: (p) => { try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* storage unavailable: theme still applies for this visit */ } const r = resolve(p); apply(r); set({ pref: p, resolved: r }); } };
});
if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { const s = useTheme.getState(); if (s.pref === 'system') s.set('system'); });
