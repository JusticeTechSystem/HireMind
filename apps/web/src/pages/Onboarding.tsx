import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { onboardingSchema, type OnboardingInput } from '@hiremind/validation';
import { api, uploadFile } from '../lib/auth';

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
export function Onboarding() {
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ['profile'], queryFn: () => api<{ completion: number }>('/profiles/me') });
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<OnboardingInput>({ resolver: zodResolver(onboardingSchema) as never });
  const [file, setFile] = useState<File | null>(null); const [uploadErr, setUploadErr] = useState('');
  const save = useMutation({
    mutationFn: async (b: OnboardingInput) => { await api('/profiles/me', { method: 'PUT', body: JSON.stringify(b) }); if (file) { try { await uploadFile('/resumes', file); } catch (e) { setUploadErr((e as Error).message); return 'upload-failed'; } } return 'ok'; },
    onSuccess: (r) => { if (r === 'ok') nav('/dashboard'); } });
  const cls = 'w-full rounded bg-charcoal border border-white/10 p-2';
  const field = (name: keyof OnboardingInput, label: string) => (
    <label className="block text-sm">{label}<input className={cls} {...register(name as never)} />
      {errors[name] && <span className="text-red-400">Invalid value</span>}</label>);
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Set up your profile</h1>
      <p className="text-gray-400 text-sm mb-4">Completion: {data?.completion ?? 0}%. Resume upload comes in Phase 3 (skippable).</p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-3">
        {field('fullName', 'Full name')}{field('title', 'Professional title')}
        <label className="block text-sm">Career level<select className={cls} {...register('careerLevel')}>{['student','junior','mid','senior','lead','executive'].map((x) => <option key={x}>{x}</option>)}</select></label>
        {field('yearsExperience', 'Years of experience')}{field('industry', 'Industry')}{field('specialization', 'Technical specialization')}
        <label className="block text-sm">Languages (comma separated)<input className={cls} onChange={(e) => setValue('languages', csv(e.target.value))} /></label>
        <label className="block text-sm">Frameworks & tools (comma separated)<input className={cls} onChange={(e) => setValue('frameworks', csv(e.target.value))} /></label>
        <label className="block text-sm">Preferred interview category<select className={cls} {...register('interviewCategory')}>{['technical','behavioral','system-design','coding','mixed'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="block text-sm">Preferred answer style<select className={cls} {...register('answerStyle')}>{['CONCISE','DETAILED','CONVERSATIONAL','STAR','TECHNICAL'].map((x) => <option key={x}>{x}</option>)}</select></label>
        {field('objectives', 'Career objectives')}
        <label className="block text-sm">Resume (optional, PDF or DOCX, max 5 MB: you can skip this and add it later)<input type="file" accept=".pdf,.docx" className="block mt-1 text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {uploadErr && <p role="alert" className="text-amber-300 text-sm">Your profile was saved, but the resume upload failed: {uploadErr}. You can retry from the Resumes page. <a className="underline" href="/dashboard">Continue to the dashboard</a></p>}
        {save.isError && <p role="alert" className="text-red-400 text-sm">Could not save. Try again.</p>}
        <button disabled={save.isPending} className="w-full rounded bg-accent p-2">Save and continue</button>
      </form>
    </main>
  );
}
