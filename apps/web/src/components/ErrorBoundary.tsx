import { Component, ReactNode } from 'react';
import { report } from '../lib/monitoring';
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { report(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main id="main" role="alert" className="min-h-screen bg-navy text-white p-8 space-y-3"><h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-gray-300">The page hit an unexpected error. Your data is safe; reloading usually fixes it.</p>
      <button className="rounded bg-accent px-4 py-2" onClick={() => window.location.reload()}>Reload</button></main>;
  }
}
