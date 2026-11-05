import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn(); const signUp = vi.fn(); let configured = true;
vi.mock('../lib/supabase', () => ({ get authConfigured() { return configured; }, supabase: { auth: { signInWithPassword: (...a: unknown[]) => signIn(...a), signUp: (...a: unknown[]) => signUp(...a), signInWithOAuth: vi.fn(), resetPasswordForEmail: vi.fn() } } }));
import { AuthPage } from './AuthPage';
const ui = (mode: 'login' | 'register' = 'login') => render(<MemoryRouter><AuthPage mode={mode} /></MemoryRouter>);
beforeEach(() => { signUp.mockReset().mockResolvedValue({ error: null }); signIn.mockReset().mockResolvedValue({ error: null }); configured = true; });

describe('AuthPage', () => {
  it('warns and disables submit when auth is not configured', () => { configured = false; ui(); expect(screen.getByRole('alert').textContent).toMatch(/not configured/i); expect((screen.getByText('Sign in', { selector: 'button' }) as HTMLButtonElement).disabled).toBe(true); });
  it('validates email and password before calling the API', async () => {
    ui(); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Sign in', { selector: 'button' })); await waitFor(() => expect(screen.getAllByText(/./).some((e) => /email|at least|characters/i.test(e.textContent ?? ''))).toBe(true)); expect(signIn).not.toHaveBeenCalled();
  });
  it('submits valid credentials', async () => {
    ui(); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByText('Sign in', { selector: 'button' })); await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'longenough1' }));
  });
  it('shows the server error on failed login', async () => {
    signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } }); ui(); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByText('Sign in', { selector: 'button' })); expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
  });
  it('registration requires accepting the terms before calling signUp', async () => {
    ui('register'); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByText('Sign up', { selector: 'button' })); expect(await screen.findByText(/accept the Terms/i)).toBeTruthy(); expect(signUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Sign up', { selector: 'button' })); await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1)); expect(signUp.mock.calls[0][0].options.data.terms_accepted_at).toBeTruthy();
  });
});
