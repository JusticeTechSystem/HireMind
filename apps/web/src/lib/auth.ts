import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
interface S { session: Session | null; ready: boolean; init: () => void; signOut: () => Promise<void>; }
export const useAuth = create<S>((set) => ({
  session: null, ready: false,
  init: () => {
    supabase.auth.getSession().then(({ data }) => set({ session: data.session, ready: true }));
    supabase.auth.onAuthStateChange((_e, session) => set({ session, ready: true }));
  },
  signOut: async () => { await supabase.auth.signOut(); },
}));
const IDEM = new Set(['/billing/checkout', '/mock-interviews', '/support', '/admin/announcements']);
/** Same request (method+path+body) within the same 10-second window gets the same key, so double clicks and retries collapse into one server-side action. */
export function idemKey(path: string, body: string, now = Date.now()) { let h = 5381; for (const c of `${path}|${body}`) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return `${(h >>> 0).toString(36)}-${Math.floor(now / 10_000)}`; }
export async function uploadFile(path: string, file: File) {
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch(`/api/v1${path}`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${useAuth.getState().session?.access_token}` } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `Upload failed (${r.status})`);
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().session?.access_token;
  const r = await fetch(`/api/v1${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(IDEM.has(path) && (init.method ?? 'GET') === 'POST' ? { 'Idempotency-Key': idemKey(path, String(init.body ?? '')) } : {}), ...init.headers } });
  if (!r.ok) { if (r.status === 402) window.dispatchEvent(new Event('limit-reached')); throw new Error(`API ${r.status}`); }
  return r.json();
}
