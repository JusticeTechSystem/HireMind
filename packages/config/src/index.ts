import { z } from 'zod';

const required = z.string().min(1);
const optional = z.string().optional();
const blank = (s: z.ZodTypeAny) => z.preprocess((v) => (v === '' ? undefined : v), s); // empty .env values count as unset
const blank = (s: z.ZodTypeAny) => z.preprocess((v) => (v === '' ? undefined : v), s); // empty .env values count as unset

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: required,
  DIRECT_URL: optional,
  JWT_SECRET: required.min(32, 'JWT_SECRET must be at least 32 chars'),
  FRONTEND_URL: required.url(),
  BACKEND_URL: required.url(),
  REDIS_URL: required,
  // Integrations: optional until credentials exist; features report "not configured".
  SUPABASE_URL: optional, SUPABASE_ANON_KEY: optional, SUPABASE_SERVICE_ROLE_KEY: optional,
  OPENAI_API_KEY: optional, OPENAI_MODEL: optional, TRANSCRIPT_RETENTION_DAYS_DEFAULT: blank(z.coerce.number().int().positive().optional()) as z.ZodType<number | undefined>, AI_LOG_RETENTION_DAYS: blank(z.coerce.number().int().positive().default(90)) as z.ZodType<number>, SOCKET_REDIS: blank(z.enum(['true', 'false']).optional()) as z.ZodType<'true' | 'false' | undefined>, SUPABASE_AVATAR_BUCKET: z.string().default('avatars'), CACHE_REDIS: blank(z.enum(['true', 'false']).optional()) as z.ZodType<'true' | 'false' | undefined>, THROTTLE_REDIS: blank(z.enum(['true', 'false']).optional()) as z.ZodType<'true' | 'false' | undefined>, STRIPE_TAX: blank(z.enum(['true', 'false']).optional()) as z.ZodType<'true' | 'false' | undefined>, PDF_FONT_PATH: optional, CLAMAV_HOST: optional, CLAMAV_PORT: z.coerce.number().default(3310), SUPABASE_RESUME_BUCKET: z.string().default('resumes'), OPENAI_REALTIME_MODEL: optional, OPENAI_TRANSCRIPTION_MODEL: optional,
  STRIPE_SECRET_KEY: optional, STRIPE_WEBHOOK_SECRET: optional,
  RESEND_API_KEY: optional, RESEND_FROM: optional, SENTRY_DSN: optional,
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = envSchema.safeParse(source);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return r.data;
}

/** Reports which integrations have credentials. Never pretend an integration is live. */
export function integrationStatus(env: Env) {
  return {
    supabase: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    openai: !!env.OPENAI_API_KEY,
    stripe: !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    resend: !!env.RESEND_API_KEY,
    sentry: !!env.SENTRY_DSN,
    malwareScan: !!env.CLAMAV_HOST,
  };
}
