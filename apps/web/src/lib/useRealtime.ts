import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth';
export interface Partial_ { source: string; text: string }
export function useRealtime(sessionId: string | undefined, onFinal: () => void, onAi?: () => void) {
  const [partials, setPartials] = useState<Record<string, Partial_>>({});
  const [connected, setConnected] = useState(false);
  const [remoteAudio, setRemoteAudio] = useState<Record<string, string>>({});
  const sock = useRef<Socket | null>(null); const last = useRef(new Map<string, number>());
  const cb = useRef(onFinal); cb.current = onFinal;
  const ai = useRef(onAi); ai.current = onAi;
  const token = useAuth((s) => s.session?.access_token);
  useEffect(() => {
    if (!sessionId || !token) return;
    const s = io(`${import.meta.env.VITE_API_URL ?? ''}/realtime`, { auth: { token }, reconnectionDelayMax: 10000 });
    sock.current = s;
    s.on('connect', () => { setConnected(true); s.emit('session:join', { sessionId }); }); // re-join after every reconnect
    s.on('disconnect', () => setConnected(false));
    s.on('audio:status', (e: { source: string; status: string }) => setRemoteAudio((p) => ({ ...p, [e.source]: e.status })));
    s.on('usage:updated', () => window.dispatchEvent(new Event('usage-updated')));
    s.on('transcript:final', () => cb.current());
    for (const ev of ['question:detected', 'answer:completed', 'answer:error']) s.on(ev, () => ai.current?.());
    return () => { s.emit('session:leave', { sessionId }); s.disconnect(); sock.current = null; };
  }, [sessionId, token]);
  const partial = useCallback((source: string, itemId: string, text: string) => {
    setPartials((p) => ({ ...p, [itemId]: { source, text } }));
    const now = Date.now(); if (now - (last.current.get(itemId) ?? 0) < 250) return; last.current.set(itemId, now);
    sock.current?.emit('transcript:partial', { sessionId, source, itemId, text });
  }, [sessionId]);
  const final = useCallback((source: string, itemId: string, eventId: string, text: string, offsetMs: number) => {
    const send = (n: number) => sock.current?.timeout(5000).emit('transcript:final', { sessionId, source, eventId, text, offsetMs },
      (err: unknown, ack?: { ok: boolean }) => { if ((err || !ack?.ok) && n < 3) setTimeout(() => send(n + 1), 1000 * (n + 1)); }); // safe to retry: server is idempotent
    send(0);
    setPartials((p) => { const { [itemId]: _, ...rest } = p; return rest; });
  }, [sessionId]);
  const audio = useCallback((source: string, status: string) => { sock.current?.emit('audio:status', { sessionId, source, status }); }, [sessionId]);
  return { partials, connected, partial, final, audio, remoteAudio };
}
