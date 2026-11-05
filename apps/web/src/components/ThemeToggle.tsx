import { Pref, useTheme } from '../lib/theme';
export function ThemeToggle() {
  const { pref, set } = useTheme();
  return <label className="text-sm inline-flex items-center gap-1"><span className="sr-only">Theme</span>
    <select aria-label="Theme" className="rounded bg-charcoal border border-white/10 p-1 text-sm" value={pref} onChange={(e) => set(e.target.value as Pref)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
