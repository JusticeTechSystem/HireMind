import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { api, useAuth } from './lib/auth';
import { AuthPage } from './pages/AuthPage';
import { About, Contact, Features, Landing, Privacy, Terms } from './pages/Public';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initMonitoring } from './lib/monitoring';
import './lib/theme';
import { Onboarding } from './pages/Onboarding';

import { AdminLink } from './components/AdminLink';
import { NotificationsLink } from './components/NotificationsLink';
import { ResetPassword } from './pages/ResetPassword';
// Code-split: each of these pages (Monaco, Mermaid, admin tools, ...) is only downloaded when visited.
const L = <T extends Record<string, React.ComponentType<any>>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] })));
const Resumes = L(() => import('./pages/Resumes'), 'Resumes'); const InterviewSetup = L(() => import('./pages/InterviewSetup'), 'InterviewSetup'); const Workspace = L(() => import('./pages/Workspace'), 'Workspace');
const CodingAssistant = L(() => import('./pages/Tools'), 'CodingAssistant'); const SystemDesign = L(() => import('./pages/Tools'), 'SystemDesign');
const MockList = L(() => import('./pages/Mock'), 'MockList'); const MockSession = L(() => import('./pages/Mock'), 'MockSession');
const History = L(() => import('./pages/History'), 'History'); const HistoryDetail = L(() => import('./pages/History'), 'HistoryDetail'); const Analytics = L(() => import('./pages/Analytics'), 'Analytics');
const Billing = L(() => import('./pages/Account'), 'Billing'); const Notifications = L(() => import('./pages/Account'), 'Notifications'); const Pricing = L(() => import('./pages/Account'), 'Pricing');
const Admin = L(() => import('./pages/Admin'), 'Admin'); const SupportForm = L(() => import('./pages/Admin'), 'SupportForm'); const Settings = L(() => import('./pages/Settings'), 'Settings');
const LBL: Record<string, string> = { aiRequests: 'AI requests', transcriptionMinutes: 'Transcription minutes', resumeAnalyses: 'Resume analyses', mockInterviews: 'Mock interviews', advancedCodingRequests: 'Advanced coding requests' };
const qc = new QueryClient();

function Protected({ children }: { children: React.ReactElement }) {
  const { session, ready } = useAuth();
  if (!ready) return <p className="p-8 text-gray-400">Loading…</p>;
  return session ? children : <Navigate to="/login" replace />;
}

interface Dash { tasks: { id: string; label: string; href: string }[]; sessions: number; questions: number; practiceMinutes: number; plan: string;
  recent: { id: string; title: string; status: string }[]; resume: { fileName: string; analysisStatus: string } | null }
function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded bg-charcoal p-4"><div className="text-2xl">{value}</div><div className="text-xs text-gray-400">{label}</div></div>;
}
function Dashboard() {
  const signOut = useAuth((s) => s.signOut);
  const prof = useQuery({ queryKey: ['profile'], queryFn: () => api<{ completion: number; profile: { fullName?: string } | null }>('/profiles/me') });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/dashboard'), enabled: (prof.data?.completion ?? 0) >= 100 });
  const bill = useQuery({ queryKey: ['billing-me'], queryFn: () => api<{ plan: { name: string }; limits: Record<string, number>; used: Record<string, number> }>('/billing/me'), enabled: !!dash.data });
  if (prof.isLoading) return <p className="p-8 text-gray-400">Loading…</p>;
  if (prof.error) return <p role="alert" className="p-8 text-red-400">Could not reach the API.</p>;
  if (!prof.data || prof.data.completion < 100) return <Navigate to="/onboarding" replace />;
  const d = dash.data;
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl mb-4">Welcome, {prof.data.profile?.fullName}</h1>
      {dash.isLoading && <p className="text-gray-400">Loading stats…</p>}
      {dash.error && <p role="alert" className="text-red-400">Could not load stats.</p>}
      {d && <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Sessions" value={d.sessions} /><Stat label="Questions" value={d.questions} />
          <Stat label="Practice (min)" value={d.practiceMinutes} /><Stat label="Plan" value={d.plan} /></div>
        <section className="mt-6"><h2 className="font-medium mb-2">Resume</h2>
          {d.resume ? <p className="text-gray-300">{d.resume.fileName} · {d.resume.analysisStatus}</p> : <p className="text-gray-400">No resume yet.</p>}
          <Link to="/resumes" className="underline text-sm">Manage resumes</Link></section>
        <section aria-label="Plan and next steps" className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded bg-charcoal p-4"><h2 className="font-medium mb-2">Plan: {bill.data?.plan.name ?? d.plan}</h2>
            {bill.data && <ul className="space-y-1 text-sm">{Object.entries(bill.data.limits).map(([k, v]) => <li key={k}>{LBL[k] ?? k}: {bill.data.used[k] ?? 0} / {v === -1 ? '∞' : v}</li>)}</ul>}<Link to="/billing" className="underline text-sm">Manage billing</Link></div>
          <div className="rounded bg-charcoal p-4"><h2 className="font-medium mb-2">Up next</h2>{d.tasks.length === 0 ? <p className="text-sm text-gray-300">You are all caught up.</p> : <ul className="space-y-1 text-sm">{d.tasks.map((t) => <li key={t.id}><Link className="underline" to={t.href}>{t.label}</Link></li>)}</ul>}</div></section>
        <div className="flex flex-wrap gap-2 mt-6"><Link to="/interviews/new" className="rounded bg-accent px-4 py-2">Start interview</Link>
          <Link to="/mock" className="rounded border border-white/20 px-4 py-2">Mock interview</Link>
          <Link to="/coding" className="rounded border border-white/20 px-4 py-2">Coding assistant</Link>
          <Link to="/system-design" className="rounded border border-white/20 px-4 py-2">System design</Link>
          <Link to="/history" className="rounded border border-white/20 px-4 py-2">History</Link>
          <Link to="/analytics" className="rounded border border-white/20 px-4 py-2">Analytics</Link>
          <Link to="/billing" className="rounded border border-white/20 px-4 py-2">Billing</Link>
          <NotificationsLink />
          <Link to="/support" className="rounded border border-white/20 px-4 py-2">Support</Link>
          <Link to="/settings" className="rounded border border-white/20 px-4 py-2">Settings</Link><AdminLink /></div>
        <section className="mt-6"><h2 className="font-medium mb-2">Recent sessions</h2>
          {d.recent.length === 0 ? <p className="text-gray-400">No sessions yet. Interview workspace arrives in Phase 4.</p>
            : <ul>{d.recent.map((s) => <li key={s.id}>{s.title} · {s.status}</li>)}</ul>}</section></>}
      <button className="mt-8 underline text-sm" onClick={signOut}>Sign out</button>
    </main>
  );
}

function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => init(), [init]);
  const session = useAuth((s) => s.session);
  const ann = useQuery({ queryKey: ['announcements'], queryFn: () => api<{ id: string; title: string; body: string }[]>('/announcements'), enabled: !!session });
  const qc2 = useQueryClient();
  useEffect(() => { const f = () => { void qc2.invalidateQueries({ queryKey: ['billing-me'] }); void qc2.invalidateQueries({ queryKey: ['dashboard'] }); }; window.addEventListener('usage-updated', f); return () => window.removeEventListener('usage-updated', f); }, [qc2]);
  const [limit, setLimit] = useState(false);
  useEffect(() => { const f = () => setLimit(true); window.addEventListener('limit-reached', f); return () => window.removeEventListener('limit-reached', f); }, []);
  return (
    <>
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:p-2">Skip to content</a>
    {ann.data?.[0] && <p role="status" className="bg-accent text-white text-sm p-2 text-center"><b>{ann.data[0].title}</b> — {ann.data[0].body}</p>}
    {limit && <p role="alert" className="bg-amber-500 text-black text-sm p-2 text-center">Plan limit reached. <Link to="/billing" onClick={() => setLimit(false)} className="underline">View usage / upgrade</Link></p>}
    <Suspense fallback={<p className="p-8 text-gray-400">Loading…</p>}>
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
      <Route path="/resumes" element={<Protected><Resumes /></Protected>} />
      <Route path="/interviews/new" element={<Protected><InterviewSetup /></Protected>} />
      <Route path="/interviews/:id" element={<Protected><Workspace /></Protected>} />
      <Route path="/coding" element={<Protected><CodingAssistant /></Protected>} />
      <Route path="/system-design" element={<Protected><SystemDesign /></Protected>} />
      <Route path="/mock" element={<Protected><MockList /></Protected>} />
      <Route path="/mock/:id" element={<Protected><MockSession /></Protected>} />
      <Route path="/history" element={<Protected><History /></Protected>} />
      <Route path="/history/:id" element={<Protected><HistoryDetail /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/billing" element={<Protected><Billing /></Protected>} />
      <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
      <Route path="/admin" element={<Protected><Admin /></Protected>} />
      <Route path="/support" element={<Protected><SupportForm /></Protected>} />
      <Route path="/" element={<Landing />} />
      <Route path="/features" element={<Features />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
    </>
  );
}

initMonitoring();
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><QueryClientProvider client={qc}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></ErrorBoundary>
);
