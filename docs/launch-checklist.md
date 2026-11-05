# Launch readiness — honest status

**Verdict: NOT launch-ready.** The code is complete in breadth but has never been compiled or run (the build environment had no network). Treat the first CI run as the start of QA, not the end.

## Definition of done, item by item
| Requirement | Status |
|---|---|
| Builds; frontend & backend run | **Unverified** — run CI |
| DB migrations run | Initial migration committed (script-generated); **CI drift check will confirm** it matches the schema |
| Authentication | Implemented (Supabase); unverified |
| Resume upload & analysis | Implemented; needs Supabase + OpenAI keys; unverified |
| Mic capture | Implemented + unit tests written; unverified in real browsers |
| System audio capture | Implemented; works only where the browser allows (desktop Chrome/Edge tab audio) |
| Real-time transcription | Implemented against OpenAI GA docs; **unverified with a live key** |
| Question detection / AI answers / CV context | Implemented; thresholds untuned; needs OpenAI key |
| Coding, system design, mock interviews | Implemented; needs OpenAI key |
| Sessions persist; analytics real data | Implemented; unverified |
| Subscriptions | Implemented; **unverified with Stripe** (test mode first) |
| Admin authorization; data isolation; security tests | Implemented; tests written, **not run** |
| Critical E2E | Written (Playwright), **not run**; `pnpm smoke` verifies a deployed API/web read-only |
| Env vars & deployment docs | Done |
| No fake placeholders in critical paths | Honored: unconfigured integrations return 503/“not configured” |

## Added in the final pass (written, unverified until CI/staging)
Dark/light/system theme · profile pictures · active-session management (list, revoke, sign out others) · answer feedback (👍/👎, shown to admins) · per-user transcript retention + platform default + AI-log pruning · Socket.IO Redis adapter (`SOCKET_REDIS=true`) · `audio:status` and `usage:updated` events · web Sentry + React error boundary · accessibility work (see below) · committed initial migration + CI drift check.

## Added in the completion pass (written, unverified until CI/staging)
Password-reset page (`/reset-password`) · terms acceptance at sign-up (recorded in Supabase user metadata) · optional resume upload during onboarding · dashboard plan/usage panel and data-driven "Up next" tasks · "Explain answer" · full context panel (relevant experience/skills/projects, difficulty, session insights) · workspace connection indicator, Settings (default answer style, auto-generate), Pause/Stop capture, tabbed mobile/tablet layout · offered (never automatic) mic reconnect · enforced mock-interview duration (server + countdown) and paginated mock history · unread badge on notifications · email + in-app notice on support replies · platform analytics for admins · refunds (Super Admin) and Stripe Tax switch · Postgres-backed job queue (resume analysis runs in the background with retries) · cache layer (memory or Redis) · Redis-backed rate limiting option · circuit breaker + retries on OpenAI calls · generic `Idempotency-Key` support · structured JSON logging with request ids and secret redaction · lazy-loaded routes · Unicode PDF export via `PDF_FONT_PATH` · demo seed (`pnpm db:seed:dev`) · post-deploy smoke test (`pnpm smoke <api> [web]`).

## Still not implemented — and why
- **Speaker diarization** (telling several interviewers apart): the realtime transcription stream does not label speakers, and the two audio sources only separate "you" from "everyone else". Needs a different transcription provider or an offline diarization step.
- **Proration preview before a plan change:** Stripe's preview-invoice API differs across API versions; the Customer Portal already shows proration when a plan is changed.
- **Supabase-side session invalidation:** I know of no stable admin API for it; revocation is enforced by this API (HTTP and sockets) instead.
- **Sandboxed code execution:** deliberately omitted (untrusted code needs real isolation, e.g. gVisor/Firecracker). Solutions are written, never run.
- **Circuit breaker on Stripe/Resend/Supabase calls:** Stripe's SDK retries (2 retries, 20 s timeout); email is best-effort; only OpenAI calls have a breaker.
- **Not verified, only written:** everything. See below.

## What only you can do
Create staging/production projects and the Supabase/Stripe/Resend/OpenAI dashboard setup · run CI and fix first-build errors · live verification (OpenAI realtime, Stripe test mode, Supabase `session_id`) · axe + screen-reader + keyboard passes · k6 on staging · ClamAV · backups/restore drill · lawyer review of the legal drafts · external security review.

## Before going live
- [ ] CI green (build, tests, `pnpm audit`); fix type errors from first compile
- [ ] After each deploy: `pnpm smoke https://api… https://app…`
- [ ] Decide: Swagger at `/api/docs` is public (the smoke test warns); restrict it at the proxy if you do not want that
- [ ] Multi-instance: `SOCKET_REDIS=true`, `THROTTLE_REDIS=true`, `CACHE_REDIS=true`, sticky sessions
- [ ] If using Stripe Tax: enable it in Stripe, set the origin address, then `STRIPE_TAX=true`
- [ ] Verify the `@nest-lab/throttler-storage-redis` version matches your `@nestjs/throttler` before enabling `THROTTLE_REDIS`
- [ ] CI drift check green (else regenerate with `pnpm db:migrate --name init`); `rls.sql` applied; backups + restore tested
- [ ] Create the private `avatars` bucket; run the axe CI job and fix what it finds; do a keyboard + screen-reader pass
- [ ] Verify the Supabase JWT contains `session_id` (needed for session management)
- [ ] Multi-instance only: `SOCKET_REDIS=true`, sticky sessions
- [ ] Staging smoke test: sign up → verify email → onboard → upload resume (check scan status) → live session with mic + tab audio → transcript persists → question detected → answer generated → end → history/PDF → billing in Stripe test mode (checkout, portal change, cancel, failed payment) → account export → account deletion
- [ ] Run k6 on staging; set real targets; fix findings
- [ ] Configure ClamAV; confirm uploads show `clean`
- [ ] Legal review of Privacy/Terms; add contact/controller details; cookie/consent needs per jurisdiction
- [ ] Set model pricing in Admin for cost tracking; set plan limits and prices deliberately
- [ ] Confirm OpenAI data-use/retention terms are acceptable for interview audio
- [ ] External security review / pen-test
