export const CAIRO_TIME_ZONE = 'Africa/Cairo';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** A wall-clock value for the picker, independent of the browser's timezone. */
export function toCairoDateTimeLocal(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Reject skipped or repeated DST minutes rather than silently changing a deadline. */
export function cairoDateTimeToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) return undefined;
  // Sample both sides of a possible clock change using IANA rules, never a fixed UTC offset.
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = wall + hours * 3_600_000;
    offsets.add(Date.parse(`${toCairoDateTimeLocal(new Date(sample))}:00Z`) - sample);
  }
  const matches = [...offsets].map((offset) => wall - offset)
    .filter((instant) => toCairoDateTimeLocal(new Date(instant)) === value);
  return matches.length === 1 ? new Date(matches[0]).toISOString() : undefined;
}
