import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './theme';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe('theme', () => {
  it('applies and persists an explicit choice', () => { useTheme.getState().set('light'); expect(document.documentElement.dataset.theme).toBe('light'); expect(localStorage.getItem('hm-theme')).toBe('light'); useTheme.getState().set('dark'); expect(document.documentElement.dataset.theme).toBe('dark'); });
  it('"system" follows the OS preference and clears the stored choice', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined })); useTheme.getState().set('system');
    expect(useTheme.getState().resolved).toBe('light'); expect(document.documentElement.dataset.theme).toBe('light'); expect(localStorage.getItem('hm-theme')).toBeNull();
  });
  it('still switches when storage is unavailable', () => { vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); }); expect(() => useTheme.getState().set('light')).not.toThrow(); expect(document.documentElement.dataset.theme).toBe('light'); vi.restoreAllMocks(); });
});
