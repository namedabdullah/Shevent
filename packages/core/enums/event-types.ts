// Mirrors the event_type rows of data/reference/vocab.csv (checked by enums.test.ts).
// The data-only value `any` ("price applies to any event type") is not a choice for hosts.

export const EVENT_TYPES = [
  'wedding_mehndi',
  'wedding_baraat',
  'wedding_walima',
  'engagement',
  'birthday',
  'corporate_dinner',
  'corporate_other',
  'university_gala',
  'concert',
  'private_party',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding_mehndi: 'Mehndi / mayun / dholki',
  wedding_baraat: 'Baraat',
  wedding_walima: 'Walima',
  engagement: 'Engagement / nikah',
  birthday: 'Birthday party',
  corporate_dinner: 'Corporate dinner or gala',
  corporate_other: 'Conference / launch / office event',
  university_gala: 'University event / gala / farewell',
  concert: 'Concert / music night',
  private_party: 'Other private party',
};

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
