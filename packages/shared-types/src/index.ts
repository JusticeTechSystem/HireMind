export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type AnswerMode = 'CONCISE'|'DETAILED'|'CONVERSATIONAL'|'STAR'|'TECHNICAL'|'BEGINNER'|'ADVANCED';
export type AudioSource = 'MICROPHONE' | 'SYSTEM';
export interface HealthResponse {
  status: 'ok'; time: string;
  integrations: Record<'supabase'|'openai'|'stripe'|'resend'|'sentry'|'malwareScan', boolean>;
}
