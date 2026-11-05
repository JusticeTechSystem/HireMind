import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const report = vi.fn(); vi.mock('../lib/monitoring', () => ({ report: (e: unknown) => report(e) }));
import { ErrorBoundary } from './ErrorBoundary';
const Boom = (): never => { throw new Error('kaboom'); };
describe('ErrorBoundary', () => {
  it('shows a recoverable fallback and reports the error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toMatch(/something went wrong/i); expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy(); expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'kaboom' }));
  });
  it('renders children when nothing fails', () => { render(<ErrorBoundary><p>fine</p></ErrorBoundary>); expect(screen.getByText('fine')).toBeTruthy(); });
});
