import { ServiceUnavailableException } from '@nestjs/common';
export class CircuitOpenError extends ServiceUnavailableException { constructor() { super('Upstream provider temporarily unavailable, please retry shortly'); } }
/** Opens after `threshold` consecutive failures; after `cooldownMs` lets one trial call through (half-open). */
export class CircuitBreaker {
  private fails = 0; private openedAt = 0;
  constructor(private threshold = 5, private cooldownMs = 30_000, private now: () => number = Date.now) {}
  get state(): 'closed' | 'open' | 'half-open' { if (this.fails < this.threshold) return 'closed'; return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open'; }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') throw new CircuitOpenError();
    try { const r = await fn(); this.fails = 0; return r; } catch (e) { this.fails++; if (this.fails >= this.threshold) this.openedAt = this.now(); throw e; }
  }
}
class RetryableHttp extends Error { constructor(public res: Response) { super(`HTTP ${res.status}`); } }
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Retries network errors, 429 and 5xx with exponential backoff behind a circuit breaker. 4xx (other than 429) are returned immediately. After the last retry the final response is returned so callers keep their own status handling. */
export async function fetchResilient(breaker: CircuitBreaker, doFetch: () => Promise<Response>, o: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<Response> {
  const retries = o.retries ?? 2, base = o.baseMs ?? 200, sleep = o.sleep ?? sleepMs;
  for (let i = 0; ; i++) {
    try { return await breaker.run(async () => { const r = await doFetch(); if (r.status >= 500 || r.status === 429) throw new RetryableHttp(r); return r; }); }
    catch (e) {
      if (e instanceof CircuitOpenError) throw e;
      if (e instanceof RetryableHttp) { if (i >= retries) return e.res; } else if (i >= retries) throw e;
      await sleep(base * 2 ** i);
    }
  }
}
