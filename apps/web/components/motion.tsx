'use client';

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import ClickSpark from '@/components/reactbits/click-spark';
import RotatingText from '@/components/reactbits/rotating-text';
import { ScrollVelocity } from '@/components/reactbits/scroll-velocity';
import SpotlightCard from '@/components/reactbits/spotlight-card';

// Shevent's wrappers around the React Bits effects in components/reactbits: theme colours and timing
// live here, so pages never pass raw values. Everything is decorative, follows the active theme, and
// sits still when the visitor asks for reduced motion.

const subscribeTheme = (callback: () => void) => {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

/** The active theme's accent colours as plain strings (canvas effects can't read CSS variables). */
function useAccentColors(): string[] {
  const value = useSyncExternalStore(
    subscribeTheme,
    () => {
      const style = getComputedStyle(document.documentElement);
      return ['--accent', '--accent-line', '--faint'].map((name) => style.getPropertyValue(name).trim()).join('|');
    },
    () => '',
  );
  return value ? value.split('|') : ['#c9441a'];
}

const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

function useReducedMotionPreference() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/** Small accent sparks wherever the visitor clicks or taps inside it. */
export function CelebrationSparks({ className = '', children }: { className?: string; children: ReactNode }) {
  const colors = useAccentColors();
  return (
    <ClickSpark className={className} sparkColor={colors} shape="line" sparkCount={10} sparkSize={12} sparkRadius={28} sparkWidth={2} duration={520} randomness={0.5}>
      {children}
    </ClickSpark>
  );
}

/**
 * One word that changes every few seconds by sliding up inside its line (no fading, so contrast is
 * always full). Screen readers get the current word once, not the animation.
 */
export function RotatingWord({ words, className = '' }: { words: string[]; className?: string }) {
  const reduced = useReducedMotionPreference();
  return (
    <RotatingText
      texts={words}
      auto={!reduced}
      rotationInterval={2400}
      staggerDuration={0.018}
      initial={{ y: '105%' }}
      animate={{ y: 0 }}
      exit={{ y: '-115%' }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      mainClassName={`inline-flex! overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom ${className}`}
    />
  );
}

/**
 * Two rows of words drifting in opposite directions, speeding up with the scroll. Decorative: the
 * same words appear as real content elsewhere on the page.
 */
export function WordMarquee({ rows }: { rows: string[][] }) {
  return (
    <div aria-hidden>
      <ScrollVelocity
        texts={rows.map((words) => words.join('   /   '))}
        velocity={34}
        numCopies={4}
        fadeEdges
        outlineAlternate
        gap={36}
        separator={<span className="inline-block size-[0.22em] translate-y-[-0.12em] rounded-full bg-accent align-middle" />}
        fontSize="clamp(2.1rem, 1.3rem + 3.6vw, 4.5rem)"
        fontWeight={600}
        scrollerStyle={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.04em', filter: 'none', paddingBlock: '0.1em' }}
      />
    </div>
  );
}

/** A card with a soft accent spotlight that follows the pointer (and keyboard focus). */
export function GlowCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <SpotlightCard
      theme="dark"
      spotlightColor="var(--accent)"
      intensity={0.16}
      spotlightSize={260}
      borderGlow={0.7}
      className={`h-full rounded-2xl! p-6! sm:p-7! ${className}`}
      style={
        {
          '--spotlight-card-surface': 'var(--surface)',
          '--spotlight-card-border': 'var(--line)',
          '--spotlight-card-shadow': 'none',
        } as CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}
