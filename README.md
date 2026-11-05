# HireMind — status

Monorepo for an AI interview copilot (React + NestJS + Prisma + Supabase). **All 12 phases of the plan and every follow-up feature are written, but nothing has been compiled or executed**: the build sandbox had no network, so only syntax parsing and a handful of dependency-free logic checks were run. Start with CI (`.github/workflows/ci.yml`), then read `docs/launch-checklist.md` for the honest done/not-done list.

Docs: `docs/architecture.md` · `database.md` · `api.md` · `security.md` · `deployment.md` · `launch-checklist.md`. Quick start: see "Run" below, then `.env.example`.

---

# HireMind — Phase 1 (Foundation)

Status: **Phase 1 scaffold only.** Phases 2–12 are not implemented.

## Run
```
cp .env.example .env   # fill DATABASE_URL, JWT_SECRET (32+ chars)
docker compose up -d
pnpm install
pnpm --filter @hiremind/config build && pnpm --filter @hiremind/shared-types build
pnpm db:migrate && pnpm db:seed
pnpm dev:api   # http://localhost:3000/api/docs
pnpm dev:web   # http://localhost:5173
```
## Not verified
Dependencies could not be installed in the build sandbox (no network), so nothing here has been built or tested yet. Run `pnpm test` after install.
Integrations (Supabase, OpenAI, Stripe, Resend, Sentry) are awaiting credentials; `/api/v1/health` reports their status.
Prisma schema covers 12 of 28 planned entities; the rest arrive with their modules.

## Phase 2 (Auth, profile, onboarding) — implemented, UNTESTED
- Supabase Auth is the identity provider; the API verifies its HS256 access token with `JWT_SECRET` (set it to your Supabase project JWT secret) and creates the local user on first request. Suspended users are blocked; `RolesGuard` + `@Roles()` protect admin routes.
- `GET/PUT /api/v1/profiles/me` (zod-validated, keyed only on the authenticated user id).
- Web: login, register (email verification via Supabase), Google OAuth, forgot password, protected routes, onboarding form.
- Needs: run `pnpm db:migrate` (new Profile columns), build `packages/validation`, enable Google provider + email confirmation in Supabase, set `VITE_SUPABASE_*`.
- Not yet done from the Module A list: profile pictures, account deletion, data export, session management, refresh handling beyond supabase-js defaults, RLS policies, and the Phase 2 Playwright/Supertest tests.

## Phase 3 (Dashboard + resumes) — implemented, UNTESTED
- `GET /dashboard` (stats from DB), `/resumes` upload (PDF/DOCX, 5 MB, magic-byte validation), list, signed preview URL (owner-checked), set default, delete, re-analyze.
- Text extraction: pdf-parse / mammoth. Structured analysis via the `AiProvider` abstraction (OpenAI impl), model output validated with zod; resume text is delimited as untrusted data in the prompt.
- Context retrieval: `retrieveContext()` keyword-overlap over the structured profile (no embeddings yet).
- Storage: private Supabase bucket named by `SUPABASE_RESUME_BUCKET` (create it as **private**). Returns 503 until credentials exist.
- Malware scan: ClamAV via `CLAMAV_HOST`; without it files are stored with `scanStatus=skipped` (NOT "clean"). Treat uploads as unscanned in production until configured.
- Run `pnpm db:migrate` (new Resume columns).
- Gaps: dashboard sections for subscription limits, coding/system-design shortcuts, prep tasks; in-app resume text preview; background queue (analysis runs in-process); embeddings retrieval; Supertest/Playwright tests.

## Phase 4 (Interview setup, lifecycle, workspace UI) — implemented, UNTESTED
- API: `POST/GET /interviews`, `GET /interviews/:id`, `POST /interviews/:id/{start,pause,resume,end}`, `GET /interviews/:id/transcripts`, `DELETE /interviews/:id`. Strict state machine (CREATED→ACTIVE⇄PAUSED→COMPLETED) with atomic status-guarded updates; paused time is excluded from `activeMs` (dashboard practice time uses it). Owner-scoped queries (404 for others).
- Web: setup page, responsive 3-panel workspace (header timer/status, transcript search + export, context panel, bottom controls).
- Audio: real browser permission flow for mic and system audio (device list, disconnect/denial/cancel/no-audio-track handling, independent stop, pause with session). **Audio is not recorded, stored or transmitted**; no transcription yet (Phase 5). The AI panel is an explicit "not connected" state, not a mock.
- Run `pnpm db:migrate` (new activeMs/lastResumedAt columns).
- Gaps: Socket.IO events (Phase 5), history/search UI, tablet/mobile tab layout polish, Playwright tests (needs real browser media mocks).

## Phase 5 (Realtime audio + transcription) — implemented, UNTESTED, UNVERIFIED AGAINST OPENAI
- Server mints a short-lived credential (`POST /api/v1/interviews/:id/transcription/token`, ACTIVE sessions only) via `POST /v1/realtime/client_secrets` with a `type: "transcription"` session (24 kHz PCM16). The permanent `OPENAI_API_KEY` never reaches the browser. 503 until the key exists.
- Browser: one independent AudioWorklet→WebSocket pipeline per source (mic, system), 24 kHz downsampling, ~100 ms chunks, backpressure (drops audio when >512 KB is buffered), exponential-backoff reconnect with a fresh credential, partial + final events.
- Socket.IO `/realtime` namespace (JWT-authenticated): `session:join|leave`, `transcript:partial` (ephemeral), `transcript:final` (validated, persisted idempotently via the `(sessionId,eventId)` unique key, then broadcast); server emits `session:started|paused|resumed|completed`. Joining requires session ownership.
- Consent prompt before first capture; raw audio is never stored.
- **Verify before trusting:** OpenAI Realtime moved to a GA protocol in 2026 and I could only confirm it from docs, not a live account. Unconfirmed: the exact `client_secrets` response shape/session fields, browser WebSocket auth via the `openai-insecure-api-key.<token>` subprotocol (WebRTC is OpenAI's documented browser path), and whether `gpt-realtime-whisper` accepts the default turn detection. These are isolated in `transcription/provider.ts` and `lib/transcriber.ts`.
- Gaps: Redis Socket.IO adapter for multi-instance scaling, socket re-auth on token expiry, audio/answer events (`audio:status`, `usage:updated`, `answer:*`), speaker diarization, transcription usage metering (Phase 9), Playwright audio tests.

## Phase 6 (AI engine) — implemented, UNTESTED, needs OPENAI_API_KEY
- **Detection:** finals from SYSTEM audio only → per-session buffer → 1.5 s debounce → cheap heuristic gate (`heuristics.ts`; ordinary speech costs no model call) → AI classification (schema-validated; confidence ≥ 0.7) → duplicate check (Jaccard ≥ 0.8 vs last 20 questions) → persist + `question:detected`. Manual question entry works without AI.
- **Answers:** `POST /questions/:id/answers {mode}` (7 modes), context = question + profile level + last 5 questions + resume retrieval; output validated with `aiAnswerSchema` (one retry), then `sanitizeAnswer()` drops resume references not actually in the resume and downgrades unsupported "verified" claims to "suggested example". Resume/question/transcript text is delimited as untrusted data. Concurrent identical requests share one model call. Events `answer:generating|completed|error`; usage recorded as `aiRequests` (enforcement is Phase 9).
- Web: question list, mode picker, generate/regenerate, copy, save, short/detailed toggle, key points, resume evidence, code, follow-ups, verification badge.
- Run `pnpm db:migrate` (InterviewQuestion.difficulty/source).
- Gaps: "explain answer" and Mermaid/code-editor views (Phases 7), difficulty/answer feedback ratings, AI request log table + cost tracking (Phase 10), embeddings-based retrieval, question-detection accuracy has not been evaluated on real interviews — thresholds are untuned guesses.

## Phase 7 (Coding, system design, mock interviews) — implemented, UNTESTED, needs OPENAI_API_KEY
- `POST /coding/solve` (9 languages; solve/debug/optimize/explain): schema-validated response with understanding, approach, code, steps, time/space complexity, edge cases, test cases. **Code is never executed** (no sandbox exists); Monaco editor with format/copy/reset.
- `POST /system-design`: requirements, architecture, DB/API design, scaling topics, trade-offs, Mermaid diagram. Mermaid is allow-listed and stripped of HTML/click directives server-side, then rendered client-side with `securityLevel: 'strict'`.
- Mock interviews: `POST/GET /mock-interviews`, `POST /:id/questions/:qid/answer` (AI evaluation on 6 dimensions, 0–10 each, schema-validated; answer text is treated as untrusted data), `POST /:id/complete` (overall 0–100 = mean of dimensions, computed deterministically from stored scores). One answer per question (DB-unique). Results persisted.
- Mic answers use the **browser's SpeechRecognition** (not our backend; explicit confirmation shown); unsupported browsers fall back to text.
- Run `pnpm db:migrate` (MockInterview, MockQuestion, MockResponse). Web deps added: `@monaco-editor/react` (loads Monaco from a CDN by default), `mermaid`.
- Gaps: timer/duration is stored but not enforced; mock history pagination; coding/design outputs are not persisted; AI scores are model judgements and not calibrated; Playwright tests.

## Phase 8 (History, summaries, analytics, exports) — implemented, UNTESTED
- History: `GET /interviews?page&q&status&category` (paginated, owner-scoped), `GET /interviews/:id/detail`, `GET /answers/saved`, `DELETE /interviews/:id/transcripts`, session delete (Phase 4).
- Summaries: `POST /interviews/:id/summary` (COMPLETED sessions only; AI, schema-validated, transcript treated as untrusted data; stored on the session).
- PDF export: `GET /interviews/:id/export.pdf` (pdfkit, owner-only). Standard PDF fonts only cover Latin text; other scripts will not render.
- Analytics: `GET /analytics?days=` computed from stored rows only. "Coding/technical/behavioral performance" are the average **mock interview scores** for those categories (live sessions are not scored), the trend compares later vs earlier half of mock scores (needs ≥4), and `codingRequests` is a usage count — not a skill measure. Charts are plain CSS bars (no chart library).
- Run `pnpm db:migrate` (InterviewSession.summary). Web dep unchanged; API dep added: `pdfkit`.
- Gaps: configurable transcript retention/auto-delete (needs a scheduled job), session list pagination size control, pdf includes at most 5000 transcript lines, Playwright tests.

## Phase 9 (Billing, usage limits, notifications) — implemented, UNTESTED, UNVERIFIED AGAINST STRIPE/RESEND
- **Plans** live in the `Plan` table (limits per calendar month UTC, `-1` = unlimited). Seed limits are **placeholders, not commercial decisions**. Prices are not invented: set `priceMonthlyCents`/`priceAnnualCents` (display only) and create the Stripe prices, then export `STRIPE_PRICE_{PRO,PREMIUM}_{MONTHLY,ANNUAL}` before `pnpm db:seed`.
- **Enforcement is server-side only:** `UsageService.assertWithin` runs before AI requests, coding, mock interviews, resume analysis, summaries and transcription credentials; over-limit → HTTP 402 `{code:'LIMIT_REACHED'}` (the UI shows an upgrade banner). Unknown metrics fail closed. Transcription minutes are metered as active session time on pause/end (an upper bound; capture runs in the browser); once the allowance is spent, new/reconnect credentials are refused. Free-plan fallback applies when no ACTIVE/TRIALING subscription exists (PAST_DUE users drop to Free limits until paid).
- **Stripe:** `POST /billing/checkout` (idempotency key, one customer per user, refuses if already subscribed), `POST /billing/portal`, `GET /billing/{plans,me,payments}`, `POST /billing/webhook` — signature verified over the raw body (`rawBody: true`), idempotent by event id (a failing handler un-records the event so Stripe retries), handles `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.{paid,payment_failed}`. Unknown prices/incomplete subscriptions grant nothing.
- **Upgrades, downgrades, cancellation** are done through the Stripe **Customer Portal**: enable plan switching, cancellation and your products in the Stripe dashboard, or those buttons will not appear.
- **Email (Resend):** welcome (first profile save), subscription confirmed/ended, payment failed, usage warning at 80% (once per metric per month). In-app notifications always stored; email skipped silently if `RESEND_API_KEY` is unset. Verification and password-reset emails are sent by **Supabase Auth** — configure Resend as Supabase's custom SMTP.
- **Verify before trusting:** I could not call Stripe or Resend. Check in test mode: the webhook event list in your endpoint settings, `current_period_end` location for your API version (both shapes are handled), and that Customer Portal config matches your plans.
- Run `pnpm db:migrate` (User.stripeCustomerId, Plan prices/currency, Subscription interval/cancelAtPeriodEnd, Payment, Notification, StripeEvent) and `pnpm install` (adds `stripe`).
- Gaps: public marketing pages (landing/features/about/contact/legal), tax/VAT handling, proration previews, refunds, dunning emails beyond Stripe's own, notification bell/unread badge in the nav, Playwright billing tests with Stripe CLI.

## Phase 10 (Administration) — implemented, UNTESTED
- **RBAC (server-enforced):** every `/admin/*` route needs ADMIN or SUPER_ADMIN; role changes, plan/limit edits and AI-pricing edits need SUPER_ADMIN. Rules: nobody modifies themselves; SUPER_ADMINs can't be modified through the API; only a SUPER_ADMIN can moderate an ADMIN. The web `/admin` redirect is cosmetic.
- **Bootstrapping the first admin:** `pnpm admin:grant you@example.com SUPER_ADMIN` (user must have signed in once). No API can create a SUPER_ADMIN.
- **Users:** search/filter/paginate, detail (account metadata, plan, usage, counts, audit history), suspend (reason required)/reactivate. **Admins cannot read transcripts, resumes or answers** through this API by design. Suspension is enforced on the next HTTP request; an already-open Socket.IO connection is not force-closed (gap).
- **Subscriptions/payments/plans:** lists, and Super Admin plan editing (strict schema: all five limits required, `price_…` ids only), all audited with before/after.
- **AI monitoring:** `OpenAiProvider` now writes an `AiRequestLog` row per call (model, purpose = first 60 chars of our own system prompt, status, HTTP status, tokens, latency — never prompt/output). The admin AI tab aggregates requests, failures, tokens, latency, daily series, recent failures. **Cost is only estimated from rates you enter** (Plans tab → AI cost pricing); unpriced models are flagged, nothing is assumed. User attribution uses AsyncLocalStorage set in `AuthGuard`; calls without a request context (e.g. none today besides question detection, which sets it explicitly) log a null user.
- **Support:** users `POST/GET /support` (5/hour); admins list/filter/update status with a note. **Announcements:** admins publish/hide/delete; users see the newest live one as a banner. **Audit log:** paginated, filterable; written for suspend/reactivate/role/plan/pricing/ticket/announcement actions and CLI grants.
- **Fix:** `zod` is now a declared dependency of `apps/api` (earlier phases imported it without declaring, which breaks under pnpm).
- Run `pnpm db:migrate` (SupportTicket, Announcement, AiRequestLog, PlatformSetting).
- Gaps: transcription cost uses minutes you meter yourself (no provider invoice reconciliation); no charts library (numbers/lists only); no email on ticket reply; AI logs have no retention job; request tracing/Sentry not wired; Playwright admin tests.

## Phase 11 (Quality assurance) — test infrastructure written; NOTHING WAS EXECUTED HERE
**What exists**
- API (Jest + Supertest): per-module unit specs from earlier phases plus `security.spec.ts` — HTTP-level checks of 401 (no/garbage/wrong-secret/`alg:none` tokens), 403 (non-admin, suspended admin, admin on Super-Admin routes), 400 validation, cross-user IDOR (404 and `userId`-scoped queries), Stripe webhook (400 on bad/missing signature, verifies the raw bytes, no user token needed) and 429 rate limiting. Jest maps `@hiremind/*` to package sources, so tests don't need a prior build, and runs with `isolatedModules` (type errors surface in `nest build`, not in Jest).
- Web (Vitest + React Testing Library): `useCapture` — mic permission denied, unsupported browser, device disconnection, immediate stop, system audio with **no audio track** (never claims capture), cancelled sharing, video dropped, independent stop of each source, pause/resume, release on unmount; `AuthPage` validation and error display.
- E2E (Playwright, `pnpm test:e2e`): the journey login → onboarding → resume upload → session → mic permission (fake device) → pause/end → history → analytics, plus redirect-when-unauthenticated. Needs a running stack and a pre-verified test user in a non-production Supabase project (`E2E_EMAIL`, `E2E_PASSWORD`; `E2E_LIVE_AI=1` adds the AI answer step). **Not covered end-to-end:** registration + email verification, real system-audio capture, live OpenAI transcription, Stripe checkout — these can't be automated headlessly without external accounts; test them manually in staging with Stripe test mode and a real browser.
- Load (k6, `pnpm test:load`): 50 req/s for 2 min. The targets in the script (health p95 < 200 ms, reads p95 < 500 ms, < 1% errors) are **proposals, not measured results**; run against staging and adjust.
- CI (`.github/workflows/ci.yml`): install, `prisma validate/generate`, apply schema + RLS to a real Postgres, build packages/api/web, run API and web tests, `pnpm audit`. **This is the first place anything will actually be compiled or run — expect to fix some type errors and failing tests on the first run**; I could only verify that every one of the 97+ TypeScript files parses, and that the dependency-free logic (question gate, similarity, resume retrieval) passes its cases when run directly.
- `prisma/rls.sql`: enables Row Level Security with no policies on every table. **Apply it** — Supabase exposes the `public` schema via PostgREST, so tables created by Prisma are otherwise readable with the public anon key. (The API connects as the DB owner and is unaffected.)

**Known gaps:** no committed Prisma migrations (generate them: `pnpm db:migrate --name init`, commit `prisma/migrations`, switch CI to `migrate deploy`); no malware-scan integration test (needs ClamAV); no prompt-injection evaluation against a real model (only prompt-structure tests); accessibility is not audited (no axe run); load results unknown.

## Phase 12 (Production readiness) — written, UNTESTED
Docs, Dockerfiles (api, web+nginx), `vercel.json`, full `.env.example`, public pages (landing, features, about, contact, privacy and terms **drafts**), logo, Sentry + request ids + uniform error filter, `/health/ready`, account **data export and deletion** (cancels Stripe, deletes files and login, tombstone blocks resurrection). Run `pnpm db:migrate` (DeletedAccount) and `pnpm install` (adds `@sentry/node`).

## Final pass — the ten follow-up features (written, UNTESTED)
1 **Theme** (system/light/dark, no flash, Monaco follows) · 2 **Profile pictures** (private `avatars` bucket) · 3 **Active sessions** (`/sessions`, revoke, sign out others; needs Supabase `session_id` claim) · 4 **Answer feedback** (`PUT/DELETE /answers/:id/feedback`) · 5 **Retention** (7/30/90/365 days per user, optional platform default, AI-log pruning) · 6 **Redis Socket.IO adapter** (`SOCKET_REDIS=true`) · 7 **`audio:status` + `usage:updated` events** · 8 **Web Sentry + error boundary** (`VITE_SENTRY_DSN`) · 9 **Accessibility**: the contrast audit found two real failures (secondary grey text 3.66:1, violet text 3.32:1) which are fixed; added skip link, focus ring, landmarks, `role=log` transcript, labelled sections, accessible chart data, jsx-a11y lint, and an axe CI scan of all pages in both themes — the axe/screen-reader run itself has not happened · 10 **Migrations** committed + CI drift check. Run `pnpm install`; the new Prisma models need no manual step beyond `pnpm db:deploy` and `prisma/rls.sql`.

## Completion pass (written, UNTESTED)
Everything buildable from the remaining list is now in: password-reset page, sign-up terms, onboarding resume upload, dashboard plan/usage + next-step tasks, Explain answer, full context panel, workspace settings/pause/stop/connection indicator/mobile tabs, offered mic reconnect, mock timing + paging, notification badge, ticket-reply emails, admin platform analytics + refunds, Stripe Tax switch, DB-backed job queue, Redis cache/throttling options, OpenAI circuit breaker, idempotency keys, JSON logging, lazy routes, Unicode PDFs, demo seed, smoke test. See `docs/launch-checklist.md` for what is deliberately not built (speaker diarization, proration preview, sandboxed execution, Supabase-side session invalidation) and what only you can do (accounts, CI, live verification, legal, ops). `pnpm install`, then `pnpm db:deploy`.
