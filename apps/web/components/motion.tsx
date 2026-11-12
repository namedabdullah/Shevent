'use client';

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import SpotlightCard from '@/components/reactbits/spotlight-card';

// Shevent's wrappers around the React Bits effects in components/reactbits: theme colours and timing
// live here, so pages never pass raw values. Everything is decorative, follows the active theme, and
// sits still when the visitor asks for reduced motion.

const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

/** True when the visitor asks for reduced motion (false in the server HTML). */
export function useReducedMotionPreference() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
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
