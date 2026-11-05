# Security

**Implemented (code present; verification pending first CI run)**
- Auth: Supabase tokens verified server-side (HS256 only; `alg:none`/wrong-secret rejected), suspended users blocked, tombstone prevents resurrecting deleted accounts.
- Authorization: `RolesGuard` on all admin routes; Super-Admin-only for roles/plans/pricing; no self-moderation; Super Admins untouchable via API. Cross-user access returns 404.
- Input: zod validation on every body/param, `ParseUUIDPipe`, helmet, CORS pinned to `FRONTEND_URL`, throttling (global + tighter on costly routes), upload limits (5 MB, magic-byte type check), optional ClamAV scan.
- Secrets: OpenAI/Stripe/Supabase service keys only on the server; browser gets a short-lived OpenAI credential. `.env` ignored; env validated at startup.
- AI safety: untrusted-data delimiting, schema validation, fabricated-experience guard, Mermaid sanitising, code never executed.
- Payments: webhook signature + idempotency; plan changes only from verified Stripe events.
- Avatars: PNG/JPEG/WebP only (magic bytes), 2 MB, private bucket, signed URLs, optional ClamAV scan; SVG/GIF refused.
- Privacy: no raw audio stored; explicit consent prompt; per-session transcript deletion; data export; account deletion (cancels Stripe, deletes files, login, rows); admins cannot read interview content; AI logs store metadata only.
- Audit log for admin actions. Errors never leak internals; request ids on every response.
- DB: `prisma/rls.sql` denies the public anon key.

- Resilience: OpenAI circuit breaker/retries; idempotency keys on sensitive POSTs; structured logs redact bearer tokens and API keys; refunds are Super-Admin-only, idempotent at Stripe and audited.

**Known gaps / risks (resolve before launch)**
- Swagger UI (`/api/docs`) is publicly reachable; restrict it at your proxy if you do not want the API surface advertised.
- The job queue and cache are only as private as your database/Redis: do not expose either publicly.
- Nothing has been executed or penetration-tested; run CI, then an external review.
- No CSRF tokens (bearer-token API, no cookies, so not applicable today — revisit if cookies are introduced).
- Malware scanning is off unless `CLAMAV_HOST` is set (uploads are marked `skipped`, not clean).
- Sockets are authenticated at connect only. Suspending a user and revoking a session now disconnect their sockets, but a merely *expired* token keeps an open socket until it reconnects.
- Session revocation blocks this API, not Supabase itself (the refresh token still works but yields the same, revoked session id). It is cached 30 s per instance. It relies on the Supabase `session_id` claim: unverified against a live project.
- OpenAI browser WebSocket auth and the GA `client_secrets` shape are unverified against a live account.
- Retention deletes transcript text and AI request logs only (sessions, answers, summaries and audit logs are kept until the user deletes them); runs in-process every 6 h.
- Accessibility: palette contrast is verified by script and an axe scan is wired into CI, but no real axe run, screen-reader or keyboard walkthrough has been performed yet.
- Legal pages are drafts. Recording-consent obligations rest on users; get legal review.
