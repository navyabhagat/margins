import { useId, type ReactNode } from 'react';

/** The Margins logo: a pencil bracket with a star, and the name in marker. */
export function Logo({ width = 180, mark = false }: { width?: number; mark?: boolean }) {
  const id = useId().replace(/:/g, '');
  const filter = `pencil-${id}`;
  const shapes = (
    <>
      <defs>
        <filter id={filter} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${filter})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M42 10 C34 9 29 10 27 11 C25 38 26 68 27 97 C31 98 36 99 43 98" strokeWidth="5" />
        <path d="M54 22 L58.5 34 L71 34.5 L61 42 L65 55 L54 47.5 L43 55 L47 42 L37 34.5 L49.5 34 L55 23" strokeWidth="2.8" />
      </g>
    </>
  );
  if (mark) {
    return (
      <svg className="logo" width={width} viewBox="18 4 60 100" aria-hidden="true" style={{ color: 'currentColor' }}>
        {shapes}
      </svg>
    );
  }
  return (
    <svg className="logo" width={width} viewBox="18 4 300 104" role="img" aria-label="margins" style={{ color: 'var(--brand)' }}>
      {shapes}
      <text x="80" y="80" fontFamily="'Reenie Beanie', cursive" fontSize="96" textLength="226"
            lengthAdjust="spacingAndGlyphs" fill="currentColor">margins</text>
    </svg>
  );
}

export function FilmPhoto({ src, alt, subtitle, height, letterbox = true, taped, className = '', children }: {
  src?: string | null; alt: string; subtitle?: string | null; height?: number | string;
  letterbox?: boolean; taped?: boolean; className?: string; children?: ReactNode;
}) {
  const classes = ['film-photo', letterbox && 'letterbox', !src && 'placeholder', taped && 'taped', className]
    .filter(Boolean).join(' ');
  return (
    <div className={classes} style={{ height }}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : <span>no photo yet</span>}
      {subtitle && src && <p className="subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}

export function Chevron() {
  return (
    <svg className="chev" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function BackArrow() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
  );
}

export function Notice({ children, error }: { children: ReactNode; error?: boolean }) {
  if (!children) return null;
  return <p className={`notice${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>;
}

export function Loading({ label = 'Opening the book…' }: { label?: string }) {
  return <div className="center-screen"><p className="hand">{label}</p></div>;
}
