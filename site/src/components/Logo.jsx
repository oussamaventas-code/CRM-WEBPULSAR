/** Símbolo de órbita/pulso + logotipo textual. */
export function PulseMark({ className = 'h-7 w-7', light = false }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={light ? 'pm-l' : 'pm'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light ? '#FFFFFF' : '#60A5FA'} />
          <stop offset="1" stopColor={light ? '#BFD7FF' : '#2563EB'} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke={`url(#${light ? 'pm-l' : 'pm'})`} strokeOpacity=".45" strokeWidth="1.5" />
      <ellipse cx="16" cy="16" rx="13" ry="5.5" fill="none" stroke={`url(#${light ? 'pm-l' : 'pm'})`} strokeWidth="1.5" transform="rotate(-28 16 16)" />
      <circle cx="16" cy="16" r="4.2" fill={`url(#${light ? 'pm-l' : 'pm'})`} />
      <circle cx="27" cy="10.2" r="1.8" fill={light ? '#FFFFFF' : '#2563EB'} />
    </svg>
  );
}

export default function Logo({ light = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <PulseMark light={light} />
      <span className={`font-mono text-[13px] font-semibold tracking-[0.18em] ${light ? 'text-white' : 'text-ink'}`}>WEB PULSAR</span>
    </span>
  );
}
