# Database

PostgreSQL via Prisma (`prisma/schema.prisma`). UUID keys, UTC `timestamptz`, cascading deletes from `User`, indexes on owner/time columns. The initial migration is committed (`prisma/migrations/20261101000000_init`, produced by `scripts/gen-init-migration.py` because Prisma's CLI was unavailable when it was written). CI runs `prisma migrate diff --exit-code` against a shadow database, so any difference from the schema fails the build; if it does, delete that folder and run `pnpm db:migrate --name init` to let Prisma regenerate it. Use `prisma migrate dev` for every later change. Apply `prisma/rls.sql` after every schema change (Row Level Security with no policies: the API connects as the DB owner; this stops Supabase's public anon key reading tables through PostgREST).

## Models (24)

- **User** — 0 fields
- **Profile** — 0 fields
- **Role** — 0 fields
- **UserRole** — 0 fields
- **Plan** — 0 fields
- **Subscription** — 0 fields
- **Resume** — 0 fields
- **InterviewSession** — 0 fields
- **Transcript** — 0 fields
- **InterviewQuestion** — 0 fields
- **AiAnswer** — 0 fields
- **UsageRecord** — 0 fields
- **AuditLog** — 0 fields
- **MockInterview** — 0 fields
- **MockQuestion** — 0 fields
- **MockResponse** — 0 fields
- **Payment** — 0 fields
- **Notification** — 0 fields
- **StripeEvent** — 0 fields
- **SupportTicket** — 0 fields
- **Announcement** — 0 fields
- **AiRequestLog** — 0 fields
- **PlatformSetting** — 0 fields
- **DeletedAccount** — 0 fields

## Mapping to the original 28-entity list
Native tables: Users, Profiles, Roles, UserRoles, Resumes, InterviewSessions→`InterviewSession`, Transcripts, InterviewQuestions, AIAnswers→`AiAnswer`, MockInterviews, MockInterviewQuestions, MockInterviewResponses, Subscriptions, Plans, Payments, UsageRecords, Notifications, AuditLogs, AIRequestLogs, SupportTickets.
Folded into other tables: ResumeAnalyses → `Resume.structured/analysisStatus`; Skills & UserSkills → resume `structured.skills` and `Profile.languages/frameworks`; AudioSources → `AudioSource` enum on `Transcript`; SavedAnswers → `AiAnswer.saved`; SessionSummaries → `InterviewSession.summary`; UserSettings → `Profile.preferences` (column exists, unused).
Newly native: AnswerFeedback (👍/👎 per user per answer). Profile columns `avatarPath`, `retentionDays` back profile pictures and retention.
Additional: UserSession (revocable login sessions), Announcement, PlatformSetting, StripeEvent (webhook idempotency), DeletedAccount (tombstone).
