import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { passwordResetSchema } from '@justiceview/validation';
import { supabase } from '../lib/supabase';

type F = { password: string; confirm: string };
/** Landing page for the Supabase password-recovery link: the link signs the user in with a recovery session, then they choose a new password. */
export function ResetPassword() {
  const nav = useNavigate(); const [ready, setReady] = useState<boolean | null>(null); const [msg, setMsg] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(passwordResetSchema) });
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady((r) => r || !!data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === 'PASSWORD_RECOVERY' || s) setReady(true); });
    const t = setTimeout(() => setReady((r) => r ?? false), 4000); // the recovery event can take a moment to fire
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);
  const submit = async (v: F) => { setMsg(''); const { error } = await supabase.auth.updateUser({ password: v.password }); if (error) return setMsg(error.message); setMsg('Password updated. Redirecting…'); setTimeout(() => nav('/dashboard'), 1200); };
  const cls = 'w-full rounded bg-charcoal border border-white/10 p-2';
  return <main id="main" className="min-h-screen bg-navy text-white grid place-items-center p-4"><div className="w-full max-w-sm space-y-3"><h1 className="text-2xl font-semibold">Choose a new password</h1>
    {ready === null && <p className="text-gray-400">Checking your link…</p>}
    {ready === false && <p role="alert" className="text-red-400">This reset link is invalid or has expired. <Link className="underline" to="/login">Go back and request a new one</Link>.</p>}
    {ready && <form onSubmit={handleSubmit(submit)} className="space-y-3">
      <input aria-label="New password" type="password" autoComplete="new-password" placeholder="New password (min 8 characters)" className={cls} {...register('password')} />{errors.password && <p className="text-red-400 text-sm">At least 8 characters.</p>}
      <input aria-label="Confirm new password" type="password" autoComplete="new-password" placeholder="Confirm new password" className={cls} {...register('confirm')} />{errors.confirm && <p className="text-red-400 text-sm">{errors.confirm.message}</p>}
      <button disabled={isSubmitting} className="w-full rounded bg-accent p-2 disabled:opacity-50">Update password</button>{msg && <p role="status" className="text-sm text-gray-300">{msg}</p>}</form>}</div></main>;
}
