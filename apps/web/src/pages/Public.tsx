import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from '../components/ThemeToggle';

function Shell({ children }: { children: ReactNode }) {
  const session = useAuth((s) => s.session);
  return <div className="min-h-screen bg-navy text-white flex flex-col">
    <header className="flex flex-wrap items-center gap-4 p-4 max-w-4xl w-full mx-auto"><Link to="/" className="flex-1"><Logo /></Link>
      <nav className="flex flex-wrap gap-4 text-sm text-gray-300"><Link to="/features">Features</Link><Link to="/pricing">Pricing</Link><Link to="/about">About</Link><Link to="/contact">Contact</Link><ThemeToggle />
        {session ? <Link to="/dashboard" className="text-white underline">Dashboard</Link> : <Link to="/login" className="text-white underline">Sign in</Link>}</nav></header>
    <main id="main" className="flex-1 p-4 max-w-4xl w-full mx-auto space-y-4">{children}</main>
    <footer className="p-4 text-xs text-gray-400 max-w-4xl w-full mx-auto flex gap-4"><span>© JusticeView</span><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></footer></div>;
}
const Draft = () => <p role="note" className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">Draft template. It describes how this build actually behaves, but it is not legal advice: have a qualified lawyer review and complete it for your jurisdictions before launch.</p>;
const H = ({ children }: { children: ReactNode }) => <h2 className="text-lg font-medium pt-2">{children}</h2>;

export function Landing() {
  return <Shell><section className="py-10 space-y-4"><h1 className="text-4xl font-semibold">Your Intelligent Interview Copilot.</h1>
    <p className="text-gray-300 max-w-xl">Prepare with mock interviews and coding and system-design practice, and get live transcription and suggested answers grounded in your own resume.</p>
    <div className="flex gap-3"><Link to="/register" className="rounded bg-accent px-5 py-2">Get started</Link><Link to="/features" className="rounded border border-white/20 px-5 py-2">See features</Link></div>
    <p className="text-xs text-gray-400">Answers are suggestions. JusticeView marks anything not backed by your resume as an example, never as your experience. Check the rules of any interview before using live assistance.</p></section></Shell>;
}
const FEATURES: [string, string][] = [
  ['Live interview workspace', 'Transcribes your microphone and (in supported desktop browsers) shared tab audio separately, detects interviewer questions, and drafts answers in seven styles.'],
  ['Resume-aware answers', 'Upload a PDF or DOCX. Answers cite the experience actually in your resume and flag suggested examples.'],
  ['Mock interviews', 'Generated questions by role, level and difficulty; scored on relevance, correctness, completeness, clarity, communication and structure.'],
  ['Coding assistant', 'Solutions with approach, complexity, edge cases and tests in nine languages. Code is never executed.'],
  ['System design assistant', 'Requirements, architecture, trade-offs and a diagram.'],
  ['History and analytics', 'Searchable sessions, summaries, PDF export and progress charts from your own data.'],
  ['Privacy controls', 'Raw audio is not stored. Delete transcripts or sessions, export your data, or delete your account in Settings.']];
export function Features() {
  return <Shell><h1 className="text-3xl font-semibold">Features</h1><ul className="grid gap-3 sm:grid-cols-2">{FEATURES.map(([t, d]) => <li key={t} className="rounded bg-charcoal p-4"><b>{t}</b><p className="text-sm text-gray-300 mt-1">{d}</p></li>)}</ul>
    <p className="text-sm text-gray-400">System audio capture depends on the browser: it works in desktop Chrome and Edge when you share a tab with “share tab audio” ticked, and is not available in most other browsers. When it is unavailable, JusticeView says so and you can add questions manually.</p></Shell>;
}
export function About() {
  return <Shell><h1 className="text-3xl font-semibold">About</h1><p className="text-gray-300">JusticeView is built by JusticeTech to help candidates prepare for interviews and stay organised during them, with transparent AI: you always see where an answer came from and what is only a suggestion.</p></Shell>;
}
export function Contact() {
  const email = import.meta.env.VITE_CONTACT_EMAIL as string | undefined; const session = useAuth((s) => s.session);
  return <Shell><h1 className="text-3xl font-semibold">Contact</h1>
    {session ? <p>Signed-in users can open a request on the <Link className="underline" to="/support">support page</Link>.</p> : <p>Signed-in users can open a request from the support page. <Link className="underline" to="/login">Sign in</Link>.</p>}
    {email ? <p>Or email <a className="underline" href={`mailto:${email}`}>{email}</a>.</p> : <p className="text-sm text-gray-400">No public contact email is configured (set VITE_CONTACT_EMAIL).</p>}</Shell>;
}
export function Privacy() {
  return <Shell><h1 className="text-3xl font-semibold">Privacy policy</h1><Draft />
    <H>What we collect</H><p className="text-sm text-gray-300">Your email and login (via Supabase); profile details you enter; resumes you upload and the text and structured data extracted from them; interview sessions, transcripts, detected questions and generated answers; mock interview answers and scores; usage counts; support messages; billing status and invoice metadata (payment card details are handled by Stripe and never reach us).</p>
    <H>Audio</H><p className="text-sm text-gray-300">Audio is captured only after you grant browser permission and press the button, with an indicator while active. While capture is on, audio is streamed to OpenAI to produce a transcript. JusticeView does not store raw audio. Transcript text is stored until you delete it.</p>
    <H>AI processing and other providers</H><p className="text-sm text-gray-300">To generate answers, evaluations and summaries, your questions, transcript excerpts and resume content are sent to OpenAI. Other processors: Supabase (authentication, database and file storage), Stripe (payments), Resend (email), Sentry (error reports, if enabled) and our hosting providers. Their own terms and retention policies apply; review them before relying on this policy. We keep metadata about AI requests (model, token counts, status) for monitoring, not their content.</p>
    <H>Your controls</H><p className="text-sm text-gray-300">You can delete resumes, transcripts and sessions, download a copy of your data, and delete your account (which also cancels any active subscription) in Settings. There is currently no automatic retention period: data stays until you delete it.</p>
    <H>Recording others</H><p className="text-sm text-gray-300">Transcribing a call can involve recording other people. You are responsible for informing participants and obtaining any consent required where you and they are located.</p>
    <H>Contact</H><p className="text-sm text-gray-300">[Add controller name, address and contact email here.]</p></Shell>;
}
export function Terms() {
  return <Shell><h1 className="text-3xl font-semibold">Terms of service</h1><Draft />
    <H>Use of the service</H><p className="text-sm text-gray-300">You must be at least 18, keep your login secure, and use JusticeView lawfully. Do not upload content you have no right to use, attempt to access other users’ data, or abuse the service or its limits.</p>
    <H>Interview rules and consent</H><p className="text-sm text-gray-300">Some employers and interviewers prohibit AI assistance or recording. You alone are responsible for complying with their rules and applicable law, and for obtaining consent before transcribing other people.</p>
    <H>AI output</H><p className="text-sm text-gray-300">Answers, scores and summaries are generated by AI, may be wrong, and are not a guarantee of any outcome. Do not present suggested examples as your own experience.</p>
    <H>Plans and billing</H><p className="text-sm text-gray-300">Paid plans renew until cancelled through the billing portal. Usage limits depend on your plan and reset monthly. [Add refund, tax and price-change terms.]</p>
    <H>Suspension and termination</H><p className="text-sm text-gray-300">We may suspend accounts that breach these terms. You may delete your account at any time in Settings.</p>
    <H>Liability and governing law</H><p className="text-sm text-gray-300">[Have counsel add warranty disclaimers, limitation of liability, governing law and dispute terms.]</p></Shell>;
}
