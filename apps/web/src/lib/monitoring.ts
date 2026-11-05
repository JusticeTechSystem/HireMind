type SentryLike = { captureException: (e: unknown) => void };
let sentry: SentryLike | null = null;
/** Starts Sentry only when VITE_SENTRY_DSN is set. PII sending is off and tracing is disabled. */
export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined; if (!dsn) return;
  void import('@sentry/react').then((S) => { S.init({ dsn, environment: import.meta.env.MODE, sendDefaultPii: false, tracesSampleRate: 0 }); sentry = S; }).catch(() => undefined);
}
export function report(error: unknown) { console.error(error); try { sentry?.captureException(error); } catch { /* never let reporting break the fallback UI */ } }
