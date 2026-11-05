import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createInterviewSchema, type CreateInterviewInput } from '@hiremind/validation';
import { api } from '../lib/auth';

export function InterviewSetup() {
  const nav = useNavigate();
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api<{ id: string; fileName: string; isDefault: boolean }[]>('/resumes') });
  const { register, handleSubmit, formState: { errors } } = useForm<CreateInterviewInput>({ resolver: zodResolver(createInterviewSchema) as never, defaultValues: { category: 'mixed' } });
  const create = useMutation({
    mutationFn: (b: CreateInterviewInput) => api<{ id: string }>('/interviews', { method: 'POST', body: JSON.stringify({ ...b, resumeId: b.resumeId || undefined }) }),
    onSuccess: (s) => nav(`/interviews/${s.id}`) });
  const cls = 'w-full rounded bg-charcoal border border-white/10 p-2';
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-md mx-auto">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold my-3">Interview setup</h1>
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3">
        <label className="block text-sm">Title<input className={cls} {...register('title')} />{errors.title && <span className="text-red-400">2–160 characters</span>}</label>
        <label className="block text-sm">Category<select className={cls} {...register('category')}>{['mixed','technical','behavioral','system-design','coding'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="block text-sm">Resume<select className={cls} {...register('resumeId')} defaultValue={resumes.data?.find((r) => r.isDefault)?.id ?? ''}>
          <option value="">None</option>{resumes.data?.map((r) => <option key={r.id} value={r.id}>{r.fileName}{r.isDefault ? ' (default)' : ''}</option>)}</select></label>
        {create.isError && <p role="alert" className="text-red-400 text-sm">Could not create session.</p>}
        <button disabled={create.isPending} className="w-full rounded bg-accent p-2">Create session</button>
      </form>
    </main>
  );
}
