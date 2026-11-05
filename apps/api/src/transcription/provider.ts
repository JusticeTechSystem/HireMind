import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '@hiremind/config';
import { CircuitBreaker, fetchResilient } from '../common/resilience';
export interface BrowserCredential { token: string; expiresAt: number | null; url: string; }
/** Transcription provider abstraction: swap implementations without touching business logic. */
export abstract class TranscriptionProvider { abstract mintBrowserCredential(): Promise<BrowserCredential>; }

/** OpenAI Realtime GA transcription session (POST /v1/realtime/client_secrets). The permanent key never leaves the server. */
@Injectable()
export class OpenAiRealtimeProvider extends TranscriptionProvider {
  private breaker = new CircuitBreaker();
  async mintBrowserCredential(): Promise<BrowserCredential> {
    const e = loadEnv();
    if (!e.OPENAI_API_KEY) throw new ServiceUnavailableException('Transcription not configured (awaiting OpenAI credentials)');
    const r = await fetchResilient(this.breaker, () => fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${e.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: { type: 'transcription', audio: { input: {
        format: { type: 'audio/pcm', rate: 24000 },
        transcription: { model: e.OPENAI_TRANSCRIPTION_MODEL || 'gpt-realtime-whisper' } } } } }),
    }));
    if (!r.ok) throw new ServiceUnavailableException(`Could not create transcription credential (${r.status})`);
    const j = (await r.json()) as { value?: string; expires_at?: number; client_secret?: { value?: string; expires_at?: number } };
    const token = j.value ?? j.client_secret?.value;
    if (!token) throw new ServiceUnavailableException('Unexpected credential response');
    return { token, expiresAt: j.expires_at ?? j.client_secret?.expires_at ?? null, url: 'wss://api.openai.com/v1/realtime?intent=transcription' };
  }
}
