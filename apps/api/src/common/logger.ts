import { LoggerService } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
export const reqContext = new AsyncLocalStorage<{ requestId?: string }>();
const redact = (s: string) => s.replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [redacted]').replace(/\b(?:sk|rk|whsec|re|price|eyJ)[_A-Za-z0-9.\-]{12,}/g, '[redacted]');
/** One JSON object per line (level, time, context, requestId + message or object fields); obvious secrets are redacted. Used in production. */
export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, params: unknown[]) {
    const last = params[params.length - 1]; const context = typeof last === 'string' ? last : undefined; const stack = params.length > 1 && typeof params[0] === 'string' ? params[0] : undefined;
    const body = typeof message === 'object' && message !== null ? (message as object) : { message: String(message) };
    process.stdout.write(redact(JSON.stringify({ time: new Date().toISOString(), level, context, requestId: reqContext.getStore()?.requestId, ...body, ...(stack ? { stack } : {}) })) + '\n');
  }
  log(m: unknown, ...p: unknown[]) { this.write('info', m, p); } error(m: unknown, ...p: unknown[]) { this.write('error', m, p); } warn(m: unknown, ...p: unknown[]) { this.write('warn', m, p); }
  debug(m: unknown, ...p: unknown[]) { this.write('debug', m, p); } verbose(m: unknown, ...p: unknown[]) { this.write('verbose', m, p); }
}
