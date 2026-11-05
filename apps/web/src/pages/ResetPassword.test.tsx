import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const updateUser = vi.fn(); let session: unknown = { user: {} };
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }), updateUser: (...a: unknown[]) => updateUser(...a) } } }));
import { ResetPassword } from './ResetPassword';
const ui = () => render(<MemoryRouter><ResetPassword /></MemoryRouter>);
beforeEach(() => { updateUser.mockReset().mockResolvedValue({ error: null }); session = { user: {} }; });
describe('ResetPassword', () => {
  it('rejects mismatched passwords without calling Supabase', async () => { ui(); fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'longenough1' } }); fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different11' } }); fireEvent.click(screen.getByText('Update password')); expect(await screen.findByText('Passwords do not match')).toBeTruthy(); expect(updateUser).not.toHaveBeenCalled(); });
  it('updates the password when valid', async () => { ui(); fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'longenough1' } }); fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'longenough1' } }); fireEvent.click(screen.getByText('Update password')); await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' })); });
  it('explains an invalid or expired link when there is no recovery session', async () => { session = null; ui(); expect((await screen.findByRole('alert', {}, { timeout: 6000 })).textContent).toMatch(/invalid or has expired/i); }, 8000);
});
