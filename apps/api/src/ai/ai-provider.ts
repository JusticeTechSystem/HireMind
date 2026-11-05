import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '@justiceview/config';
import { CircuitBreaker, CircuitOpenError, fetchResilient } from '../common/resilience';
import { PrismaService } from '../prisma/prisma.service';
import { aiContext } from './ai-context';
/** Provider abstraction: business logic depends on this, not on OpenAI. */
export abstract class AiProvider {
  abstract jsonCompletion(system: string, user: string): Promise<unknown>;
}
@Injectable()
export class OpenAiProvider extends AiProvider {
  private log = new Logger('AiProvider'); private breaker = new CircuitBreaker();
  constructor(@Optional() private prisma?: PrismaService) { super(); }
  /** Best-effort request log for admin monitoring: stores metadata only (never prompts or outputs) and can never break the request. */
  private record(row: { model: string; purpose: string; status: 'ok' | 'error'; httpStatus?: number; promptTokens?: number; completionTokens?: number; latencyMs: number }) {
    void this.prisma?.aiRequestLog.create({ data: { provider: 'openai', userId: aiContext.getStore()?.userId, ...row } }).catch((e: Error) => this.log.warn(`log failed: ${e.message}`));
  }
  async jsonCompletion(system: string, user: string): Promise<unknown> {
    const e = loadEnv();
    if (!e.OPENAI_API_KEY) throw new ServiceUnavailableException('AI not configured (awaiting OpenAI credentials)');
    const model = e.OPENAI_MODEL ?? 'gpt-4o-mini'; const purpose = system.slice(0, 60); const t0 = Date.now();
    let r: Response;
    try {
      // retries network errors / 429 / 5xx with backoff; the breaker fails fast while OpenAI is down
      r = await fetchResilient(this.breaker, () => fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${e.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      }));
    } catch (err) {
      if (err instanceof CircuitOpenError) throw err;
      this.record({ model, purpose, status: 'error', latencyMs: Date.now() - t0 }); throw new ServiceUnavailableException(`AI request failed: ${(err as Error).name}`);
    }
    if (!r.ok) { this.record({ model, purpose, status: 'error', httpStatus: r.status, latencyMs: Date.now() - t0 }); throw new ServiceUnavailableException(`AI request failed (${r.status})`); }
    const j = (await r.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    this.record({ model, purpose, status: 'ok', promptTokens: j.usage?.prompt_tokens, completionTokens: j.usage?.completion_tokens, latencyMs: Date.now() - t0 });
    return JSON.parse(j.choices[0].message.content);
  }
}
