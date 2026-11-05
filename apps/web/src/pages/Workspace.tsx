import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { CapStatus, useCapture } from '../lib/useCapture';
import { startTranscriber, TxStatus } from '../lib/transcriber';
import { useRealtime } from '../lib/useRealtime';
import { Logo } from '../components/Logo';
import { ContextPanel } from '../components/ContextPanel';
import { AiPanel } from './AiPanel';

interface Session { id: string; title: string; category: string | null; status: 'CREATED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'; activeMs: number; lastResumedAt: string | null; resume: { fileName: string; analysisStatus: string } | null }
interface Seg { id: string; source: 'MICROPHONE' | 'SYSTEM'; text: string; offsetMs: number }
const MODES = ['CONCISE', 'DETAILED', 'CONVERSATIONAL', 'STAR', 'TECHNICAL', 'BEGINNER', 'ADVANCED'] as const;
const MSG: Record<CapStatus, string> = {
  off: 'Off', requesting: 'Waiting for permission…', on: 'Active', denied: 'Permission denied — allow microphone in browser settings',
  unsupported: 'Not supported in this browser (use desktop Chrome/Edge)', 'no-audio': 'No audio track shared — pick a tab and tick "Share tab audio"',
  cancelled: 'Sharing cancelled', disconnected: 'Device disconnected', error: 'Capture error' };
const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return [s / 3600, (s / 60) % 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':'); };
type Settings = { mode: (typeof MODES)[number]; auto: boolean };
const loadSettings = (): Settings => { try { return { mode: 'CONCISE', auto: false, ...JSON.parse(localStorage.getItem('hm-ws-settings') ?? '{}') }; } catch { return { mode: 'CONCISE', auto: false }; } };

export function Workspace() {
  const { id } = useParams(); const qc = useQueryClient(); const cap = useCapture();
  const [q, setQ] = useState(''); const [now, setNow] = useState(Date.now()); const [tab, setTab] = useState<'transcript' | 'ai' | 'context'>('ai');
  const [settings, setSettings] = useState(loadSettings); const [selQ, setSelQ] = useState<string | null>(null); const [captureOff, setCaptureOff] = useState(false);
  const save = (s: Settings) => { setSettings(s); try { localStorage.setItem('hm-ws-settings', JSON.stringify(s)); } catch { /* storage unavailable: setting lasts for this visit */ } };
  const sess = useQuery({ queryKey: ['session', id], queryFn: () => api<Session>(`/interviews/${id}`) });
  const tr = useQuery({ queryKey: ['transcripts', id], queryFn: () => api<{ items: Seg[] }>(`/interviews/${id}/transcripts`), refetchInterval: 5000 });
  const act = useMutation({ mutationFn: (a: string) => api<Session>(`/interviews/${id}/${a}`, { method: 'POST' }), onSuccess: (s) => qc.setQueryData(['session', id], s) });
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = sess.data; const elapsedRef = useRef(0);
  const rt = useRealtime(id, () => qc.invalidateQueries({ queryKey: ['transcripts', id] }), () => qc.invalidateQueries({ queryKey: ['questions', id] }));
  const [tx, setTx] = useState<{ mic: TxStatus; sys: TxStatus }>({ mic: 'idle', sys: 'idle' });
  const consent = () => {
    if (sessionStorage.getItem('hm-consent')) return true;
    const ok = confirm('Audio will be streamed to OpenAI to produce a live transcript while capture is on. Raw audio is not stored. Only continue if everyone on the call consents to being transcribed.');
    if (ok) sessionStorage.setItem('hm-consent', '1'); return ok;
  };
  const getCredential = () => api<{ token: string; url: string }>(`/interviews/${id}/transcription/token`, { method: 'POST' });
  const live = s?.status === 'ACTIVE' || s?.status === 'PAUSED';
  useEffect(() => { cap.setPaused(s?.status === 'PAUSED' || captureOff); }, [s?.status, captureOff]); // eslint-disable-line
  useEffect(() => { if (s?.status === 'COMPLETED') { cap.stopMic(); cap.stopSystem(); } }, [s?.status]); // eslint-disable-line
  useEffect(() => { if (rt.connected) rt.audio('MICROPHONE', cap.mic); }, [cap.mic, rt.connected]); // eslint-disable-line
  useEffect(() => { if (rt.connected) rt.audio('SYSTEM', cap.sys); }, [cap.sys, rt.connected]); // eslint-disable-line
  useEffect(() => { // one independent transcriber per source; stopped when the session pauses/ends, capture is paused, or capture stops
    const stream = cap.streams.mic; if (s?.status !== 'ACTIVE' || !stream || captureOff) return;
    return startTranscriber({ stream, source: 'MICROPHONE', baseMs: elapsedRef.current, getCredential, onStatus: (m) => setTx((t) => ({ ...t, mic: m })), onPartial: (i, t) => rt.partial('MICROPHONE', i, t), onFinal: (i, e, t, o) => rt.final('MICROPHONE', i, e, t, o) });
  }, [s?.status, cap.streams.mic, captureOff]); // eslint-disable-line
  useEffect(() => {
    const stream = cap.streams.sys; if (s?.status !== 'ACTIVE' || !stream || captureOff) return;
    return startTranscriber({ stream, source: 'SYSTEM', baseMs: elapsedRef.current, getCredential, onStatus: (m) => setTx((t) => ({ ...t, sys: m })), onPartial: (i, t) => rt.partial('SYSTEM', i, t), onFinal: (i, e, t, o) => rt.final('SYSTEM', i, e, t, o) });
  }, [s?.status, cap.streams.sys, captureOff]); // eslint-disable-line
  const elapsed = s ? s.activeMs + (s.status === 'ACTIVE' && s.lastResumedAt ? now - new Date(s.lastResumedAt).getTime() : 0) : 0; elapsedRef.current = elapsed;
  const segs = useMemo(() => (tr.data?.items ?? []).filter((x) => x.text.toLowerCase().includes(q.toLowerCase())), [tr.data, q]);
  const exportTxt = () => { const body = (tr.data?.items ?? []).map((x) => `[${fmt(x.offsetMs)}] ${x.source}: ${x.text}`).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' })); a.download = `transcript-${id}.txt`; a.click(); };
  if (sess.isLoading) return <p className="p-8 text-gray-400">Loading…</p>;
  if (sess.error || !s) return <p role="alert" className="p-8 text-red-400">Session not found.</p>;
  const btn = 'rounded border border-white/20 px-3 py-1 text-sm disabled:opacity-40';
  const dot = (on: boolean) => <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full mr-1 ${on ? 'bg-green-400' : 'bg-gray-400'}`} />;
  const show = (t: typeof tab) => `${tab === t ? '' : 'hidden'} lg:block`; // mobile/tablet: one panel at a time; desktop: all three
  return (
    <div className="min-h-screen bg-navy text-white flex flex-col">
      <header className="flex flex-wrap items-center gap-3 p-3 border-b border-white/10">
        <Link to="/dashboard" aria-label="HireMind dashboard"><Logo size={22} /></Link>
        <span className="flex-1 truncate">{s.title}</span>
        <span role="timer" aria-label="Session timer" className="font-mono">{fmt(elapsed)}</span>
        <span className="text-xs text-gray-300">{s.status}</span>
        <span className="text-xs" title="Realtime link to the server (live events and sync)">{dot(rt.connected)}{rt.connected ? 'Connected' : 'Offline'}</span>
        <span className="text-xs">{dot(cap.mic === 'on' && !captureOff)}Mic</span><span className="text-xs">{dot(cap.sys === 'on' && !captureOff)}System audio</span>
        {s.status === 'CREATED' && <button className={btn} onClick={() => act.mutate('start')}>Start</button>}
        {s.status === 'ACTIVE' && <button className={btn} onClick={() => act.mutate('pause')}>Pause session</button>}
        {s.status === 'PAUSED' && <button className={btn} onClick={() => act.mutate('resume')}>Resume session</button>}
        {live && <button className={btn} onClick={() => confirm('End this session?') && act.mutate('end')}>End session</button>}
      </header>
      {act.isError && <p role="alert" className="p-2 text-red-400 text-sm">Action failed: {(act.error as Error).message}</p>}
      <div role="tablist" aria-label="Workspace panels" className="lg:hidden flex gap-1 p-2 border-b border-white/10">{(['transcript', 'ai', 'context'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`${btn} flex-1 ${tab === t ? 'bg-accent/30' : ''}`} onClick={() => setTab(t)}>{t === 'ai' ? 'AI assistant' : t === 'transcript' ? 'Transcript' : 'Context'}</button>)}</div>
      <div id="main" tabIndex={-1} className="flex-1 grid gap-3 p-3 lg:grid-cols-[1fr_1.4fr_1fr] min-h-0">
        <section aria-label="Live transcript" className={`${show('transcript')} rounded bg-charcoal p-3 flex flex-col min-h-[200px]`}>
          <div className="flex gap-2 mb-2"><input aria-label="Search transcript" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 rounded bg-navy p-1 text-sm" /><button className={btn} onClick={exportTxt} disabled={!tr.data?.items.length}>Export</button></div>
          <div role="log" aria-live="polite" aria-label="Transcript" className="flex-1 overflow-y-auto text-sm space-y-1">
            {segs.length === 0 ? <p className="text-gray-400">{tr.data?.items.length ? 'No matches.' : 'No transcript yet. Enable the mic or share system audio to begin.'}</p>
              : segs.map((x) => <p key={x.id}><span className="text-gray-400">{fmt(x.offsetMs)} {x.source === 'MICROPHONE' ? 'You' : 'Interviewer'}: </span>{x.text}</p>)}
            {Object.entries(rt.partials).map(([k, p]) => <p key={k} className="italic text-gray-400">{p.text}…</p>)}</div>
        </section>
        <div className={show('ai')}><AiPanel sessionId={id!} onSelect={setSelQ} defaultMode={settings.mode} autoGenerate={settings.auto} /></div>
        <div className={show('context')}><ContextPanel sessionId={id!} questionId={selQ} /></div>
      </div>
      <footer className="p-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
        {live ? <>
          <button className={btn} onClick={cap.mic === 'on' ? cap.stopMic : () => consent() && cap.startMic()}>{cap.mic === 'on' ? 'Stop mic' : 'Enable mic'}</button>
          {cap.canRecover && <button className={`${btn} border-amber-400`} onClick={() => consent() && cap.startMic()}>Microphone is back: reconnect</button>}
          {cap.devices.length > 1 && <select aria-label="Microphone device" className="bg-charcoal rounded p-1 text-sm" value={cap.deviceId} onChange={(e) => cap.setDeviceId(e.target.value)}><option value="">Default</option>{cap.devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select>}
          <button className={btn} onClick={cap.sys === 'on' ? cap.stopSystem : () => consent() && cap.startSystem()}>{cap.sys === 'on' ? 'Stop system audio' : 'Share system audio'}</button>
          <button className={btn} aria-pressed={captureOff} disabled={cap.mic !== 'on' && cap.sys !== 'on'} onClick={() => setCaptureOff(!captureOff)}>{captureOff ? 'Resume capture' : 'Pause capture'}</button>
          <button className={btn} disabled={cap.mic !== 'on' && cap.sys !== 'on'} onClick={() => { cap.stopMic(); cap.stopSystem(); setCaptureOff(false); }}>Stop capture</button>
        </> : <span className="text-sm text-gray-300">{s.status === 'COMPLETED' ? 'Session ended.' : 'Start the session to enable audio.'}</span>}
        <details className="relative"><summary className={`${btn} cursor-pointer list-none`}>Settings</summary>
          <div className="absolute bottom-10 left-0 z-10 w-64 rounded bg-charcoal border border-white/20 p-3 space-y-2 text-sm">
            <label className="block">Default answer style<select className="w-full rounded bg-navy border border-white/10 p-1" value={settings.mode} onChange={(e) => save({ ...settings, mode: e.target.value as Settings['mode'] })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="flex gap-2 items-start"><input type="checkbox" checked={settings.auto} onChange={(e) => save({ ...settings, auto: e.target.checked })} className="mt-1" /><span>Generate an answer automatically when a question is detected (uses your plan’s AI requests)</span></label>
            <p className="text-xs text-gray-300">Applies to the next page load for the default style. Stored in this browser only.</p></div></details>
        <span role="status" className="text-xs text-gray-300 basis-full">Mic: {MSG[cap.mic]} · System: {MSG[cap.sys]}. Audio is streamed to OpenAI for transcription only while enabled; raw audio is not stored. Transcription — mic: {tx.mic}, system: {tx.sys}; realtime link: {rt.connected ? 'connected' : 'offline'}.{Object.keys(rt.remoteAudio).length > 0 && ` Other devices on this session — ${Object.entries(rt.remoteAudio).map(([k, v]) => `${k === 'MICROPHONE' ? 'mic' : 'system'}: ${v}`).join(', ')}.`}</span>
      </footer>
    </div>
  );
}
