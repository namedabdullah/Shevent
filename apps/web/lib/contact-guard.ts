// Keeping bookings on Shevent: the database decides (private.contact_reason() in
// supabase/migrations/20261117000000_contact_guard.sql) and the app explains. Chat messages go
// through send_message(), which answers with the reason; quotes and listings are rejected with
// SQLSTATE SV001, the reason in `details` and the field in `hint`.

export const CONTACT_REASONS = ['phone', 'email', 'link', 'social', 'contact', 'payment', 'outside', 'meeting'] as const;
export type ContactReason = (typeof CONTACT_REASONS)[number];

const OFF_PLATFORM = 'SV001';

export function isContactReason(value: unknown): value is ContactReason {
  return typeof value === 'string' && (CONTACT_REASONS as readonly string[]).includes(value);
}

/** The field and reason when the database refused text that would take a booking off Shevent, else null. */
export function contactBlock(error: { code?: string; details?: string | null; hint?: string | null } | null | undefined): { reason: ContactReason; field: string } | null {
  if (error?.code !== OFF_PLATFORM || !isContactReason(error.details)) return null;
  return { reason: error.details, field: error.hint ?? '' };
}
