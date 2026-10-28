'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { LogoMark } from '@/components/logo';
import CircularText from '@/components/reactbits/circular-text';
import ClickSpark from '@/components/reactbits/click-spark';
import { ScrollVelocity } from '@/components/reactbits/scroll-velocity';
import SpotlightCard from '@/components/reactbits/spotlight-card';

// Shevent's wrappers around the React Bits effects in components/reactbits: brand colours and timing
// live here, so pages never pass raw hex values. Everything is decorative and keeps working (static)
// when the visitor asks for reduced motion.

// Brand values as literals: canvas and WebGL can't read CSS variables (same hexes as globals.css).
const GOLD_100 = '#f5e7c2';
const GOLD_200 = '#ebd08a';
const GOLD_300 = '#ddb55a';
const MARIGOLD_400 = '#eb9a2c';

const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

/** True when the visitor prefers reduced motion (false during server rendering). */
function useReducedMotionPreference() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/** Gold and marigold star sparks wherever the visitor clicks or taps inside it: a small celebration. */
export function CelebrationSparks({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <ClickSpark
      className={className}
      sparkColor={[GOLD_200, MARIGOLD_400, GOLD_100]}
      shape="star"
      sparkCount={9}
      sparkSize={11}
      sparkRadius={34}
      duration={650}
      randomness={0.6}
      glow={0.6}
      gravity={0.25}
    >
      {children}
    </ClickSpark>
  );
}

/** A slowly turning seal around the rosette, like a wax stamp on a wedding card. */
export function RosetteSeal({ text, size = 132, className = '' }: { text: string; size?: number; className?: string }) {
  return (
    <div aria-hidden className={`rounded-full bg-cream/95 text-brand-800 shadow-lift ring-1 ring-gold-200 ${className}`} style={{ width: size, height: size }}>
      <CircularText text={text} size={size} fontSize={Math.round(size / 10.5)} fontWeight={600} spinDuration={28} onHover="speedUp" ring ringColor={GOLD_300} className="font-sans tracking-[0.2em] uppercase">
        <LogoMark className="size-[34%]" />
      </CircularText>
    </div>
  );
}

/**
 * Two rows of words drifting in opposite directions, speeding up with the scroll. Decorative: the
 * same words appear as real content elsewhere on the page.
 */
export function WordMarquee({ rows, separator }: { rows: string[][]; separator?: ReactNode }) {
  return (
    <div aria-hidden>
      <ScrollVelocity
        texts={rows.map((words) => words.join('  ·  '))}
        velocity={38}
        numCopies={4}
        fadeEdges
        outlineAlternate
        gap={28}
        separator={separator ?? <LogoMark className="inline size-[0.55em] align-middle" />}
        fontSize="clamp(2.25rem, 1.4rem + 4.2vw, 5rem)"
        fontWeight={500}
        scrollerStyle={{ fontFamily: 'var(--font-heading), Georgia, serif', fontStyle: 'italic', filter: 'none', paddingBlock: '0.12em' }}
      />
    </div>
  );
}

const LightRays = dynamic(() => import('@/components/reactbits/light-rays'), { ssr: false });

/** Warm stage light falling from the top of a night section. Loaded only in the browser. */
export function StageLights({ className = '' }: { className?: string }) {
  const reduced = useReducedMotionPreference();
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <LightRays
        raysOrigin="top-center"
        raysColor={GOLD_200}
        raysSpeed={reduced ? 0 : 0.55}
        lightSpread={0.85}
        rayLength={1.6}
        glow={0.5}
        haze={0.3}
        intensity={0.9}
        followMouse={false}
        cursorShadow={false}
        clickPulse={false}
        opacity={0.75}
        maxDevicePixelRatio={1.5}
      />
    </div>
  );
}

/** A card on a night section with a gold spotlight that follows the pointer (and keyboard focus). */
export function GlowCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <SpotlightCard
      theme="dark"
      spotlightColor={GOLD_300}
      intensity={0.22}
      spotlightSize={260}
      borderGlow={0.8}
      className={`h-full p-6! sm:p-7! ${className}`}
      style={
        {
          '--spotlight-card-surface': 'rgb(255 255 255 / 0.035)',
          '--spotlight-card-border': 'rgb(255 255 255 / 0.12)',
          '--spotlight-card-shadow': 'none',
        } as CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}
