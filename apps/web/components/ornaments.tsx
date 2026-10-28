import type { CSSProperties } from 'react';
import { LogoMark } from '@/components/logo';

// Brand ornaments: original drawings, no photos, so nothing here can pass for a real vendor's work.
// All of them are decorative (aria-hidden) and only move when the visitor allows motion.

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

// Marigold strings (lariyan) hanging from the arch: x position, length, sway timing.
const GARLANDS = [
  { x: 52, length: 250, delay: -1.2, duration: 7.5 },
  { x: 100, length: 312, delay: -4.1, duration: 8.2 },
  { x: 148, length: 214, delay: -2.6, duration: 6.8 },
  { x: 200, length: 352, delay: -0.4, duration: 7.9 },
  { x: 252, length: 214, delay: -3.3, duration: 7.1 },
  { x: 300, length: 312, delay: -5.2, duration: 8.6 },
  { x: 348, length: 250, delay: -1.9, duration: 7.3 },
];

// Fairy-light strings across the arch: height and how far each one sags.
const LIGHTS = [
  { y: 138, sag: 40 },
  { y: 196, sag: 46 },
  { y: 256, sag: 52 },
];

const DIYAS = [60, 107, 153, 200, 247, 293, 340];

const STARS = [
  [120, 70, 0],
  [172, 44, 1.1],
  [236, 58, 2.3],
  [286, 92, 0.6],
  [96, 118, 1.7],
  [318, 132, 2.8],
  [200, 96, 0.9],
] as const;

const delay = (seconds: number, duration?: number): CSSProperties => ({
  animationDelay: `${seconds}s`,
  ...(duration ? { animationDuration: `${duration}s` } : {}),
});

/**
 * The landing page's hero: a Lahore wedding night seen through a Mughal arch. Marigold garlands
 * sway, string lights twinkle, diyas glow, and the Shevent rosette rises like a moon.
 */
export function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="-16 -16 432 532" aria-hidden focusable="false" className={`h-auto w-full animate-fade-in overflow-visible ${className}`}>
      <defs>
        <clipPath id="hero-arch">
          <path d="M0 500V210C0 96 86 30 200 0c114 30 200 96 200 210v290z" />
        </clipPath>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-brand-950)' }} />
          <stop offset="0.6" style={{ stopColor: 'var(--color-brand-900)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-brand-800)' }} />
        </linearGradient>
        <radialGradient id="hero-glow" cx="0.5" cy="0.62" r="0.5">
          <stop offset="0" style={{ stopColor: 'var(--color-gold-300)', stopOpacity: 0.42 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold-300)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="hero-floor" cx="0.5" cy="1" r="0.75">
          <stop offset="0" style={{ stopColor: 'var(--color-gold-200)', stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold-200)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      {/* Outer frame */}
      <path d="M-10 510V208C-10 88 81 18 200-12c119 30 210 100 210 220v302" fill="none" className="stroke-gold-400" strokeWidth="1" opacity="0.8" />

      <g clipPath="url(#hero-arch)">
        <rect x="-20" y="-20" width="440" height="540" fill="url(#hero-sky)" />
        <circle cx="200" cy="320" r="190" fill="url(#hero-glow)" />
        <rect x="-20" y="360" width="440" height="160" fill="url(#hero-floor)" />

        {STARS.map(([cx, cy, wait]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" className="animate-twinkle fill-gold-100" style={delay(wait)} />
        ))}

        {/* The rosette moon */}
        <g transform="translate(200 318) scale(3.1) translate(-16 -16)" opacity="0.32">
          <g className="fill-gold-300">
            {PETALS.map((angle) => (
              <ellipse key={angle} cx="16" cy="7.5" rx="3.4" ry="6" transform={`rotate(${angle} 16 16)`} />
            ))}
          </g>
          <circle cx="16" cy="16" r="6" className="fill-brand-700" />
          <circle cx="16" cy="16" r="2.2" className="fill-gold-100" />
        </g>

        {/* String lights: a wire, a soft glow, and two sets of bulbs that twinkle out of step */}
        {LIGHTS.map(({ y, sag }, index) => {
          const d = `M-30 ${y} Q200 ${y + sag * 2} 430 ${y}`;
          return (
            <g key={y} fill="none" strokeLinecap="round">
              <path d={d} className="stroke-gold-400" strokeWidth="0.8" opacity="0.45" />
              <path d={d} className="stroke-gold-200" strokeWidth="12" strokeDasharray="0 26" opacity="0.16" />
              <path d={d} className="animate-twinkle stroke-gold-100" strokeWidth="4.5" strokeDasharray="0 26" style={delay(index * 0.5)} />
              <path d={d} className="animate-twinkle stroke-gold-200" strokeWidth="3.5" strokeDasharray="0 26" strokeDashoffset="13" style={delay(index * 0.5 + 1.6)} />
            </g>
          );
        })}

        {/* Marigold garlands, each swaying from its top */}
        {GARLANDS.map(({ x, length, delay: wait, duration }) => (
          <g key={x} className="origin-top animate-sway [transform-box:fill-box]" style={delay(wait, duration)} strokeLinecap="round">
            <line x1={x} y1="-10" x2={x} y2={length} className="stroke-gold-500" strokeWidth="1" opacity="0.7" />
            <line x1={x} y1="-10" x2={x} y2={length} className="stroke-marigold-400" strokeWidth="11" strokeDasharray="0 12.5" />
            <line x1={x} y1="-10" x2={x} y2={length} className="stroke-marigold-500" strokeWidth="4.5" strokeDasharray="0 12.5" />
            <line x1={x} y1="-10" x2={x} y2={length} className="stroke-brand-400" strokeWidth="10" strokeDasharray="0 62.5" />
            <line x1={x} y1="-10" x2={x} y2={length} className="stroke-gold-200" strokeWidth="3" strokeDasharray="0 62.5" />
            <path d={`M${x} ${length + 4}l-4 14h8z`} className="fill-gold-300" />
          </g>
        ))}

        {/* Diyas along the floor */}
        {DIYAS.map((x, index) => (
          <g key={x}>
            {/* The group holds the faintness; the animation would override an opacity on the circle. */}
            <g opacity="0.22">
              <circle cx={x} cy="458" r="16" className="animate-twinkle fill-gold-200" style={delay(index * 0.37)} />
            </g>
            <path d={`M${x} 446c4 6 5 10 0 13-5-3-4-7 0-13z`} className="fill-gold-100" />
            <path d={`M${x - 12} 462q12 13 24 0z`} className="fill-gold-500" />
          </g>
        ))}
      </g>

      {/* Inner gold line */}
      <path d="M8 500V212C8 104 92 41 200 9c108 32 192 95 192 203v288" fill="none" className="stroke-gold-300" strokeWidth="1.5" />
    </svg>
  );
}

// Bead strings for the small arch window: left offset (%), length (%), sway delay (s).
const WINDOW_STRINGS = [
  [14, 46, -1.4],
  [30, 62, -3.8],
  [50, 74, -0.6],
  [70, 62, -2.9],
  [86, 46, -4.6],
] as const;

/**
 * A small arch-shaped night window (CSS only): marigold strings and the rosette. Give it a
 * portrait size, e.g. `w-56 aspect-[4/5]`. Unlike <HeroArt> it can appear several times a page.
 */
export function ArchWindow({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`arch-mask relative overflow-hidden bg-linear-to-b from-brand-950 via-brand-900 to-brand-800 ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_68%,rgb(221_181_90/0.38),transparent_58%)]" />
      {WINDOW_STRINGS.map(([left, length, wait]) => (
        <span
          key={left}
          className="absolute top-0 w-3 origin-top -translate-x-1/2 animate-sway bg-[radial-gradient(circle,var(--color-marigold-400)_0_4.5px,transparent_5px)] bg-size-[12px_12.5px] bg-repeat-y"
          style={{ left: `${left}%`, height: `${length}%`, animationDelay: `${wait}s` }}
        />
      ))}
      <LogoMark className="absolute top-[64%] left-1/2 size-[34%] -translate-1/2 drop-shadow-[0_0_24px_rgb(221_181_90/0.45)]" />
    </div>
  );
}

/** A toran-style edge of marigold beads with a rose bead every fifth, for the top of night sections. */
export function BeadEdge({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-3 bg-[radial-gradient(circle,var(--color-brand-400)_0_3.5px,transparent_4px),radial-gradient(circle,var(--color-marigold-400)_0_3.5px,transparent_4px)] bg-size-[70px_12px,14px_12px] bg-center bg-repeat-x ${className}`}
    />
  );
}
