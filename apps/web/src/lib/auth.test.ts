import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => undefined, signOut: async () => undefined } } }));
import { idemKey } from './auth';
describe('idemKey', () => {
  it('is stable for the same request inside a 10 s window (double clicks collapse)', () => { expect(idemKey('/billing/checkout', '{"a":1}', 1_000)).toBe(idemKey('/billing/checkout', '{"a":1}', 9_000)); });
  it('differs for different bodies, paths and windows', () => { const k = idemKey('/support', 'a', 1000); expect(idemKey('/support', 'b', 1000)).not.toBe(k); expect(idemKey('/mock-interviews', 'a', 1000)).not.toBe(k); expect(idemKey('/support', 'a', 20_000)).not.toBe(k); });
});
