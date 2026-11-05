# Architecture

```
Browser (React/Vite) ──REST /api/v1──▶ NestJS API ──Prisma──▶ PostgreSQL (Supabase)
   │  ▲  Socket.IO /realtime            │  ├─▶ Supabase Auth (JWT verified locally with JWT_SECRET) + Storage (private resume bucket)
   │  └────────────────────────────────┘  ├─▶ OpenAI (chat completions; realtime credentials minted server-side)
   └─ WebSocket (short-lived credential) ─────▶ OpenAI Realtime transcription       ├─▶ Stripe (checkout/portal/webhooks) · Resend (email) · Sentry
```
**Monorepo:** `apps/web`, `apps/api`, `packages/{config,shared-types,validation}` (zod schemas shared by both ends), `prisma/`.
**Key decisions**
- *Identity:* Supabase Auth issues tokens; the API verifies them (HS256) and mirrors the user locally. Authorization (roles, ownership) is entirely in the API.
- *Ownership by construction:* every user-scoped query includes `userId` in the `where`; other users' records return 404.
- *AI behind interfaces:* `AiProvider`, `TranscriptionProvider`, `StripeGateway`, `StorageService` isolate vendors. All model output is schema-validated (one retry) before use; user/resume/transcript text is delimited as untrusted data; `sanitizeAnswer()` removes resume claims not present in the resume.
- *Audio:* captured and processed in the browser (one AudioWorklet pipeline per source, 24 kHz PCM16) and streamed straight to OpenAI with a short-lived credential; the server only receives text. Raw audio is never stored.
- *Detection cost control:* system-audio finals → 1.5 s debounce → regex gate → AI classification → dedupe.
- *Limits:* plan limits live in the `Plan` table and are enforced server-side before costly work (HTTP 402).
- *Webhooks:* signature over raw body; idempotent by Stripe event id.
**Scaling notes:** set `SOCKET_REDIS=true` to share Socket.IO rooms and events across instances through Redis (startup fails if Redis is unreachable). Still per-instance, by design or for now: question-detection buffers (use sticky sessions so one session's transcript lands on one instance), rate-limit counters (each instance counts separately), the 30 s session-revocation cache, and the in-flight answer de-duplication. A background retention job runs on every instance; it is idempotent.
**Sessions & events:** login sessions (Supabase `session_id`) are registered and revocable; a per-user Socket.IO room carries `usage:updated` (emitted by a Prisma middleware on every usage write) and forced disconnects; `audio:status` relays capture state between a user's devices.

**Background work:** a Postgres job queue (`Job` table; `FOR UPDATE SKIP LOCKED` claim, 5 attempts with exponential backoff, stuck jobs reclaimed after 5 min) runs resume analysis on any API instance. Retention (transcripts, AI logs, idempotency keys) runs every 6 h in-process.
**Resilience:** OpenAI calls (answers, analysis, realtime credentials) retry network/429/5xx with backoff behind a circuit breaker (opens after 5 consecutive failures for 30 s). Sensitive POSTs (checkout, mock interview, support ticket, announcement) honour an `Idempotency-Key` header: repeats replay the stored response, concurrent duplicates get 409.
**Caching:** plan rows (60 s) via `CacheService` — per-instance memory, or Redis with `CACHE_REDIS=true`; admin plan edits invalidate immediately on the instance that handled them (others within 60 s).
**Observability:** production logs are JSON lines with request ids and secret redaction; uniform error shape; Sentry on API and web (when DSNs are set); `/health/ready` for probes; job and AI-failure counts in Admin → Overview health.
