# API

Generated from controller decorators. **Swagger at `/api/docs` is authoritative** (request/response schemas live in `packages/validation`). Errors: `{statusCode, message, requestId}`; plan limits return `402 {code:'LIMIT_REACHED'}`.
Realtime: Socket.IO namespace `/realtime` (auth: `{token}` handshake) — events `session:join|leave`, `transcript:partial|final` (client→server), `session:started|paused|resumed|completed`, `question:detected`, `answer:generating|completed|error`, `transcript:final` (server→client). Not implemented: `audio:status`, `usage:updated`.

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/account/export` | signed-in |
| DELETE | `/api/v1/account` | signed-in |
| GET | `/api/v1/admin/overview` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/users` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/users/:id` | signed-in + ADMIN, SUPER_ADMIN |
| POST | `/api/v1/admin/users/:id/suspend` | signed-in + ADMIN, SUPER_ADMIN |
| POST | `/api/v1/admin/users/:id/reactivate` | signed-in + ADMIN, SUPER_ADMIN |
| PUT | `/api/v1/admin/users/:id/role` | signed-in + SUPER_ADMIN |
| GET | `/api/v1/admin/subscriptions` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/payments` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/plans` | signed-in + ADMIN, SUPER_ADMIN |
| PUT | `/api/v1/admin/plans/:code` | signed-in + SUPER_ADMIN |
| GET | `/api/v1/admin/settings/pricing` | signed-in + ADMIN, SUPER_ADMIN |
| PUT | `/api/v1/admin/settings/pricing` | signed-in + SUPER_ADMIN |
| GET | `/api/v1/admin/ai` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/health` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/tickets` | signed-in + ADMIN, SUPER_ADMIN |
| PATCH | `/api/v1/admin/tickets/:id` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/announcements` | signed-in + ADMIN, SUPER_ADMIN |
| POST | `/api/v1/admin/announcements` | signed-in + ADMIN, SUPER_ADMIN |
| PATCH | `/api/v1/admin/announcements/:id` | signed-in + ADMIN, SUPER_ADMIN |
| DELETE | `/api/v1/admin/announcements/:id` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/admin/analytics` | signed-in + ADMIN, SUPER_ADMIN |
| POST | `/api/v1/admin/payments/:id/refund` | signed-in + SUPER_ADMIN |
| GET | `/api/v1/admin/audit` | signed-in + ADMIN, SUPER_ADMIN |
| GET | `/api/v1/me` | signed-in |
| GET | `/api/v1/announcements` | signed-in |
| POST | `/api/v1/support` | signed-in |
| GET | `/api/v1/support` | signed-in |
| GET | `/api/v1/sessions` | signed-in |
| POST | `/api/v1/sessions/revoke-others` | signed-in |
| POST | `/api/v1/sessions/:id/revoke` | signed-in |
| GET | `/api/v1/billing/plans` | public |
| GET | `/api/v1/billing/me` | signed-in |
| GET | `/api/v1/billing/payments` | signed-in |
| POST | `/api/v1/billing/checkout` | signed-in |
| POST | `/api/v1/billing/portal` | signed-in |
| POST | `/api/v1/billing/webhook` | public |
| GET | `/api/v1/dashboard` | signed-in |
| GET | `/api/v1/health` | public |
| GET | `/api/v1/health/ready` | public |
| GET | `/api/v1/analytics` | signed-in |
| GET | `/api/v1/interviews/:id/detail` | signed-in |
| POST | `/api/v1/interviews/:id/summary` | signed-in |
| DELETE | `/api/v1/interviews/:id/transcripts` | signed-in |
| GET | `/api/v1/interviews/:id/export.pdf` | signed-in |
| GET | `/api/v1/answers/saved` | signed-in |
| POST | `/api/v1/interviews` | signed-in |
| GET | `/api/v1/interviews` | signed-in |
| GET | `/api/v1/interviews/:id` | signed-in |
| GET | `/api/v1/interviews/:id/transcripts` | signed-in |
| POST | `/api/v1/interviews/:id/start` | signed-in |
| POST | `/api/v1/interviews/:id/pause` | signed-in |
| POST | `/api/v1/interviews/:id/resume` | signed-in |
| POST | `/api/v1/interviews/:id/end` | signed-in |
| DELETE | `/api/v1/interviews/:id` | signed-in |
| POST | `/api/v1/mock-interviews` | signed-in |
| GET | `/api/v1/mock-interviews` | signed-in |
| GET | `/api/v1/mock-interviews/:id` | signed-in |
| POST | `/api/v1/mock-interviews/:id/questions/:qid/answer` | signed-in |
| POST | `/api/v1/mock-interviews/:id/complete` | signed-in |
| GET | `/api/v1/notifications` | signed-in |
| POST | `/api/v1/notifications/read-all` | signed-in |
| PATCH | `/api/v1/notifications/:id/read` | signed-in |
| GET | `/api/v1/profiles/me/avatar` | signed-in |
| POST | `/api/v1/profiles/me/avatar` | signed-in |
| DELETE | `/api/v1/profiles/me/avatar` | signed-in |
| GET | `/api/v1/profiles/me` | signed-in |
| PUT | `/api/v1/profiles/me/retention` | signed-in |
| PUT | `/api/v1/profiles/me` | signed-in |
| GET | `/api/v1/interviews/:id/questions` | signed-in |
| POST | `/api/v1/interviews/:id/questions` | signed-in |
| POST | `/api/v1/questions/:qid/answers` | signed-in |
| GET | `/api/v1/questions/:qid/answers` | signed-in |
| PUT | `/api/v1/answers/:id/feedback` | signed-in |
| POST | `/api/v1/answers/:id/explain` | signed-in |
| GET | `/api/v1/interviews/:id/context` | signed-in |
| DELETE | `/api/v1/answers/:id/feedback` | signed-in |
| PATCH | `/api/v1/answers/:id/save` | signed-in |
| GET | `/api/v1/resumes` | signed-in |
| POST | `/api/v1/resumes` | signed-in |
| GET | `/api/v1/resumes/:id/url` | signed-in |
| PATCH | `/api/v1/resumes/:id/default` | signed-in |
| POST | `/api/v1/resumes/:id/analyze` | signed-in |
| DELETE | `/api/v1/resumes/:id` | signed-in |
| POST | `/api/v1/coding/solve` | signed-in |
| POST | `/api/v1/system-design` | signed-in |
| POST | `/api/v1/interviews/:id/transcription/token` | signed-in |
