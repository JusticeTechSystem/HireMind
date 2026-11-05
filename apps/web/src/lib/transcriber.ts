import type { AudioSource } from '@justiceview/shared-types';
export interface Cred { token: string; url: string }
export type TxStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'failed';
interface Opts { stream: MediaStream; source: AudioSource; baseMs: number; getCredential: () => Promise<Cred>;
  onPartial: (itemId: string, text: string) => void; onFinal: (itemId: string, eventId: string, text: string, offsetMs: number) => void; onStatus: (s: TxStatus) => void }

// Downsamples to 24 kHz mono PCM16 inside an AudioWorklet and posts ~100 ms chunks.
const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.t=0;this.o=[];this.r=sampleRate/24000}
process(i){const c=i[0][0];if(!c)return true;while(this.t<c.length){const a=Math.floor(this.t),f=this.t-a,s0=c[a],s1=a+1<c.length?c[a+1]:s0;this.o.push(s0+(s1-s0)*f);this.t+=this.r}
this.t-=c.length;if(this.o.length>=2400){const b=new Int16Array(this.o.length);for(let k=0;k<b.length;k++){const x=Math.max(-1,Math.min(1,this.o[k]));b[k]=x<0?x*32768:x*32767}this.o=[];this.port.postMessage(b.buffer,[b.buffer])}return true}}
registerProcessor('pcm24',P)`;
const b64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 4096) s += String.fromCharCode(...u.subarray(i, i + 4096)); return btoa(s); };

/** One independent pipeline per audio source. Returns a stop function. */
export function startTranscriber(o: Opts): () => void {
  let stopped = false, ws: WebSocket | null = null, attempts = 0, timer: number | undefined;
  const t0 = performance.now(); const text = new Map<string, string>(); const first = new Map<string, number>();
  const ctx = new AudioContext(); let node: AudioWorkletNode | null = null;
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));

  const connect = async () => {
    if (stopped) return;
    o.onStatus(attempts ? 'reconnecting' : 'connecting');
    try {
      const c = await o.getCredential(); if (stopped) return;
      ws = new WebSocket(c.url, ['realtime', `openai-insecure-api-key.${c.token}`]);
      ws.onopen = () => { attempts = 0; o.onStatus('live'); };
      ws.onmessage = (m) => {
        let e: { type?: string; item_id?: string; delta?: string; transcript?: string }; try { e = JSON.parse(m.data); } catch { return; }
        const id = e.item_id; if (!id) return;
        if (e.type === 'conversation.item.input_audio_transcription.delta') {
          if (!first.has(id)) first.set(id, performance.now());
          const t = (text.get(id) ?? '') + (e.delta ?? ''); text.set(id, t); o.onPartial(id, t);
        } else if (e.type === 'conversation.item.input_audio_transcription.completed' && e.transcript?.trim()) {
          const at = first.get(id) ?? performance.now(); text.delete(id); first.delete(id);
          o.onFinal(id, `${o.source}:${id}`, e.transcript.trim(), Math.max(0, Math.round(o.baseMs + at - t0)));
        }
      };
      ws.onclose = () => { if (stopped) return; if (++attempts > 5) return o.onStatus('failed'); timer = window.setTimeout(connect, Math.min(1000 * 2 ** attempts, 15000)); };
      ws.onerror = () => ws?.close();
    } catch { if (stopped) return; if (++attempts > 5) return o.onStatus('failed'); timer = window.setTimeout(connect, Math.min(1000 * 2 ** attempts, 15000)); }
  };

  (async () => {
    await ctx.audioWorklet.addModule(url);
    if (stopped) return;
    node = new AudioWorkletNode(ctx, 'pcm24'); ctx.createMediaStreamSource(o.stream).connect(node);
    node.port.onmessage = (m) => { // backpressure: skip audio while the socket is congested or closed
      if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 512 * 1024) return;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64(m.data as ArrayBuffer) }));
    };
    void connect();
  })().catch(() => o.onStatus('failed'));

  return () => { stopped = true; window.clearTimeout(timer); ws?.close(); node?.disconnect(); void ctx.close(); URL.revokeObjectURL(url); o.onStatus('idle'); };
}
