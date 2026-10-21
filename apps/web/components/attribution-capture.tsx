'use client';

import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution';

/** Remembers the visitor's first landing page, UTM tags and referrer for lead forms. */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
