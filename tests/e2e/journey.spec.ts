import { expect, test } from '@playwright/test';
import path from 'path';

// Needs a running stack plus a pre-verified test account in a NON-production Supabase project:
//   E2E_EMAIL, E2E_PASSWORD (required) · E2E_LIVE_AI=1 (also needs OPENAI_API_KEY on the API) to run the AI steps.
const { E2E_EMAIL, E2E_PASSWORD, E2E_LIVE_AI } = process.env;
test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'set E2E_EMAIL and E2E_PASSWORD (verified test user) to run the journey');

test('login → onboarding → resume → session → mic permission → pause/end → history → analytics', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/login'); await page.getByLabel('Email').fill(E2E_EMAIL!); await page.getByLabel('Password').fill(E2E_PASSWORD!); await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.waitForURL(/\/(dashboard|onboarding)/);
  if (page.url().includes('/onboarding')) { // first run for this account
    await page.getByLabel('Full name').fill('E2E Tester'); await page.getByLabel('Professional title').fill('Engineer'); await page.getByLabel('Years of experience').fill('5');
    await page.getByLabel('Industry').fill('Software'); await page.getByLabel('Technical specialization').fill('Backend');
    await page.getByLabel('Languages (comma separated)').fill('TypeScript'); await page.getByLabel('Frameworks & tools (comma separated)').fill('NestJS');
    await page.getByRole('button', { name: 'Save and continue' }).click();
  }
  await expect(page.getByText(/Welcome,/)).toBeVisible();

  await page.goto('/resumes'); await page.locator('input[type=file]').setInputFiles(path.join(__dirname, '../fixtures/resume.pdf'));
  await expect(page.getByText('resume.pdf').first()).toBeVisible({ timeout: 20_000 });

  const title = `E2E ${Date.now()}`;
  await page.goto('/interviews/new'); await page.getByLabel('Title').fill(title); await page.getByRole('button', { name: 'Create session' }).click();
  await page.waitForURL(/\/interviews\/[0-9a-f-]{36}/);
  await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByText('ACTIVE')).toBeVisible();

  // Microphone permission is auto-granted with a fake device; consent dialog is accepted above.
  await page.getByRole('button', { name: 'Enable mic' }).click(); await expect(page.getByRole('status')).toContainText('Mic: Active');
  // System audio can't be driven headlessly: assert the honest unsupported/cancelled path doesn't claim capture.
  await expect(page.getByRole('status')).not.toContainText('System: Active');

  if (E2E_LIVE_AI) { // manual question → AI answer (requires OPENAI_API_KEY)
    await page.getByLabel('Add question manually').fill('Explain how closures work in JavaScript?'); await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: /Generate answer/ }).click(); await expect(page.getByText(/Confidence:/)).toBeVisible({ timeout: 60_000 });
  }

  await page.getByRole('button', { name: 'Pause session' }).click(); await expect(page.getByText('PAUSED')).toBeVisible();
  await page.getByRole('button', { name: 'Resume session' }).click(); await page.getByRole('button', { name: 'End session' }).click(); await expect(page.getByText('Session ended.')).toBeVisible();

  await page.goto('/history'); await page.getByLabel('Search sessions').fill(title); await expect(page.getByRole('link', { name: title })).toBeVisible();
  await page.goto('/analytics'); await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible(); await expect(page.getByText('Sessions').first()).toBeVisible();
});

test('unauthenticated users are redirected away from protected pages', async ({ page }) => {
  for (const p of ['/dashboard', '/interviews/new', '/billing', '/admin']) { await page.goto(p); await page.waitForURL(/\/login/); }
});
