// Date-only values (YYYY-MM-DD) are handled in UTC so the printed day never shifts with the
// device timezone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : undefined;
}

/** "2026-12-19" → "Sat, 19 Dec 2026" */
export function formatEventDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Today's date in Lahore (UTC+5, no daylight saving) as YYYY-MM-DD. */
export function todayInLahore(now: Date = new Date()): string {
  return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const LAHORE_OFFSET_MS = 5 * 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A Lahore date and time ("2026-12-12", "16:30") as an ISO instant ("2026-12-12T16:30:00+05:00"), or undefined. */
export function lahoreDateTime(date: string, time: string): string | undefined {
  if (!parseIsoDate(date) || !TIME.test(time)) return undefined;
  return `${date}T${time}:00+05:00`;
}

/** An instant shown in Lahore time: "Sat, 12 Dec 2026, 4:30 pm". */
export function formatVisitTime(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  const lahore = new Date(instant.getTime() + LAHORE_OFFSET_MS);
  const hours = lahore.getUTCHours();
  const minutes = String(lahore.getUTCMinutes()).padStart(2, '0');
  const clock = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
  return `${formatEventDate(lahore.toISOString().slice(0, 10))}, ${clock}`;
}
