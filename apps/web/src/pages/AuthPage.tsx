import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { credentialsSchema } from '@justiceview/validation';
import { authConfigured, supabase } from '../lib/supabase';

type F = { email: string; password: string };
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const nav = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(credentialsSchema) });
  const submit = async (v: F) => {
    setMsg(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword(v);
      if (error) return setMsg(error.message);
      nav('/dashboard');
    } else {
      if (!terms) return setMsg('Please accept the Terms and Privacy Policy to continue.');
      const { error } = await supabase.auth.signUp({ ...v, options: { emailRedirectTo: window.location.origin + '/login', data: { terms_accepted_at: new Date().toISOString() } } });
      setMsg(error ? error.message : 'Check your email to verify your account.');
    }
  };
  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/dashboard' } });
  const forgot = async (email: string) => {
    if (!email) return setMsg('Enter your email first.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' });
    setMsg(error ? error.message : 'Password reset email sent.');
  };
  const cls = 'w-full rounded bg-charcoal border border-white/10 p-2';
  return (
    <main id="main" className="min-h-screen bg-navy text-white grid place-items-center p-4">
      <form onSubmit={handleSubmit(submit)} className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        {!authConfigured && <p role="alert" className="text-amber-400 text-sm">Auth not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>}
        <input aria-label="Email" placeholder="Email" className={cls} {...register('email')} />
        {errors.email && <p className="text-red-400 text-sm">{errors.email.message}</p>}
        <input aria-label="Password" type="password" placeholder="Password" className={cls} {...register('password')} />
        {errors.password && <p className="text-red-400 text-sm">{errors.password.message}</p>}
        {mode === 'register' && <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" /><span>I agree to the <Link className="underline" to="/terms" target="_blank">Terms</Link> and <Link className="underline" to="/privacy" target="_blank">Privacy Policy</Link>.</span></label>}
        <button disabled={isSubmitting || !authConfigured} className="w-full rounded bg-accent p-2 disabled:opacity-50">{mode === 'login' ? 'Sign in' : 'Sign up'}</button>
        <button type="button" onClick={google} disabled={!authConfigured} className="w-full rounded border border-white/20 p-2 disabled:opacity-50">Continue with Google</button>
        {mode === 'login' && <button type="button" className="text-sm text-gray-400 underline" onClick={() => forgot((document.querySelector('input[aria-label=Email]') as HTMLInputElement).value)}>Forgot password?</button>}
        {msg && <p role="status" className="text-sm text-gray-300">{msg}</p>}
        <p className="text-sm text-gray-400">{mode === 'login' ? <Link to="/register">Need an account?</Link> : <Link to="/login">Have an account?</Link>}</p>
      </form>
    </main>
  );
}
