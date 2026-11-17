// Venue visits (supabase/migrations/20261118000000_venue_visits.sql): shared by the visit card, its forms
// and the server actions in lib/visit-actions.ts.

import type { Database } from '@shevent/core/database';
import type { ContactReason } from '@/lib/contact-guard';

export type Visit = Pick<
  Database['public']['Tables']['visits']['Row'],
  'id' | 'status' | 'starts_at' | 'host_note' | 'venue_address' | 'venue_note' | 'cancelled_by'
>;

export const VISIT_COLUMNS = 'id, status, starts_at, host_note, venue_address, venue_note, cancelled_by';

/** Times a host can pick, in Lahore: 10:00 am to 8:00 pm, every half hour. */
export const VISIT_TIMES = Array.from({ length: 21 }, (_, index) => {
  const minutes = 10 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

/** "16:30" → "4:30 pm" */
export function clockLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}

/** Requested or confirmed, and not long past: the visit in play. A day's grace keeps it shown on the day. */
export function isActiveVisit(visit: Pick<Visit, 'status' | 'starts_at'> | null | undefined, now: Date): visit is Visit {
  if (!visit || (visit.status !== 'requested' && visit.status !== 'confirmed')) return false;
  const start = new Date(visit.starts_at).getTime();
  return visit.status === 'requested' ? start > now.getTime() : start > now.getTime() - 24 * 60 * 60 * 1000;
}

export type VisitFormState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'failed' | 'taken'; fields: string[] }
  | { status: 'error'; error: 'contact'; fields: string[]; reason: ContactReason };
