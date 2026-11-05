export function Logo({ size = 28 }: { size?: number }) {
  return <span className="inline-flex items-center gap-2 font-semibold" aria-label="JusticeView">
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="jv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#3b82f6" /></linearGradient></defs>
      <rect width="32" height="32" rx="8" fill="url(#jv)" /><path d="M8 16.5c2.4-3.6 5-5.4 8-5.4s5.6 1.8 8 5.4c-2.4 3.6-5 5.4-8 5.4s-5.6-1.8-8-5.4Z" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="16" cy="16.5" r="2.6" fill="#fff" /></svg>
    <span>Justice<span className="text-accent-text">View</span></span></span>;
}
