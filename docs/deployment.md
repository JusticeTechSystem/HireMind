# Deployment

**Order of operations (staging first, then production)**
1. Supabase: create project; enable email confirmation and Google provider; copy URL, anon key, service-role key, JWT secret; create **private** buckets `resumes` and `avatars`; (optional) set Resend as custom SMTP so verification/reset emails use your domain.
2. Database: migrations are committed; in deploys run `pnpm exec prisma migrate deploy` as a **release step** (not at container start), then `pnpm exec prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma`, then `pnpm db:seed` (roles, plans; set `STRIPE_PRICE_*` first).
3. Stripe (test mode first): create Pro/Premium products with monthly+annual prices; configure the Customer Portal (plan switching, cancellation); add webhook `{BACKEND_URL}/api/v1/billing/webhook` for `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`; set display prices in Admin → Plans.
4. API: build `infrastructure/docker/api.Dockerfile`; run behind HTTPS (e.g. AWS ECS/App Runner or any container host) with `SOCKET_REDIS=true` if running more than one instance (plus sticky sessions); probe `/api/v1/health/ready`; set env from `.env.example`; set `FRONTEND_URL` to the exact web origin.
5. Web: Vercel (root `apps/web`, build `pnpm --filter @hiremind/web build`); edit `apps/web/vercel.json` with your API host; set `VITE_*` vars, `VITE_API_URL` = API origin (Socket.IO bypasses rewrites). Alternative: `web.Dockerfile` + nginx.
6. First admin: `pnpm admin:grant you@example.com SUPER_ADMIN`.
7. Backups: enable Supabase PITR/daily backups; test a restore. Monitoring: set `SENTRY_DSN`; alert on `/health/ready` and 5xx rate.
8. Verify: `pnpm smoke https://api.example.com https://app.example.com` (read-only), then the manual checklist in `docs/launch-checklist.md`.
9. Demo data (non-production only): `pnpm db:seed:dev`, then create the matching Supabase user (id/email printed by the script).

Local: `docker compose up -d` (Postgres, Redis), or `docker compose --profile app up --build` for api+web.
