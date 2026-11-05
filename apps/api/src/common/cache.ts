import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '@hiremind/config';
import { createClient } from 'redis';

/** Small TTL cache. In-memory by default; Redis-backed (shared across instances) when CACHE_REDIS=true. Redis failures degrade to a miss, never an error. */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Cache'); private mem = new Map<string, { v: string; exp: number }>(); private redis?: ReturnType<typeof createClient>;
  async onModuleInit() {
    const e = loadEnv(); if (e.CACHE_REDIS !== 'true') return;
    try { this.redis = createClient({ url: e.REDIS_URL }); this.redis.on('error', (err) => this.log.warn(`redis: ${err.message}`)); await this.redis.connect(); }
    catch (err) { this.log.warn(`Redis cache unavailable, using memory: ${(err as Error).message}`); this.redis = undefined; }
  }
  async onModuleDestroy() { await this.redis?.quit().catch(() => undefined); }
  async get<T>(key: string): Promise<T | undefined> {
    try { const raw = this.redis ? await this.redis.get(`hm:${key}`) : (() => { const h = this.mem.get(key); return h && h.exp > Date.now() ? h.v : null; })(); return raw ? (JSON.parse(raw) as T) : undefined; } catch { return undefined; }
  }
  async set(key: string, value: unknown, ttlSec: number) {
    const v = JSON.stringify(value);
    try { if (this.redis) await this.redis.set(`hm:${key}`, v, { EX: ttlSec }); else this.mem.set(key, { v, exp: Date.now() + ttlSec * 1000 }); } catch { /* cache is best-effort */ }
  }
  async del(...keys: string[]) { for (const k of keys) { this.mem.delete(k); try { await this.redis?.del(`hm:${k}`); } catch { /* ignore */ } } }
  /** Returns the cached value, or computes and caches it. Null/undefined results are not cached. */
  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key); if (hit !== undefined) return hit;
    const v = await fn(); if (v !== null && v !== undefined) await this.set(key, v, ttlSec); return v;
  }
}
@Global() @Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
