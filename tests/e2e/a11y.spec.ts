import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Automated WCAG 2.1 A/AA scan of every page reachable without a login, in both themes.
// Authenticated pages need E2E_EMAIL/E2E_PASSWORD (see journey.spec.ts) and are scanned too when provided.
const PUBLIC = ['/', '/features', '/pricing', '/about', '/contact', '/privacy', '/terms', '/login', '/register', '/reset-password'];
for (const theme of ['dark', 'light'] as const) {
  for (const path of PUBLIC) {
    test(`a11y ${theme} ${path}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('hm-theme', t), theme); await page.goto(path); await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }
}
const { E2E_EMAIL, E2E_PASSWORD } = process.env;
test.describe('authenticated pages', () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'needs a verified test user');
  for (const theme of ['dark', 'light'] as const) for (const path of ['/dashboard', '/resumes', '/interviews/new', '/mock', '/coding', '/system-design', '/history', '/analytics', '/billing', '/notifications', '/settings', '/support']) {
    test(`a11y ${theme} ${path}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('hm-theme', t), theme);
      await page.goto('/login'); await page.getByLabel('Email').fill(E2E_EMAIL!); await page.getByLabel('Password').fill(E2E_PASSWORD!); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(/\/(dashboard|onboarding)/);
      await page.goto(path); await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.monaco-editor').analyze();
      expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }
});
