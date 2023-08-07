// Business hours are stored as wall-clock minutes in the business's timezone.
// These helpers convert between that and UTC instants without pulling in a tz library.

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

/** The UTC instant for a wall-clock time (minutes after midnight) on `date` in `timeZone`. */
export function zonedToUtc(date: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = parseDate(date);
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  const first = offsetMinutes(new Date(naive), timeZone);
  let result = naive - first * 60_000;
  // Second pass settles times near a DST change.
  const second = offsetMinutes(new Date(result), timeZone);
  if (second !== first) result = naive - second * 60_000;
  return new Date(result);
}

export function zonedParts(instant: Date, timeZone: string): { date: string; weekday: number; minuteOfDay: number } {
  const w = wallClock(instant, timeZone);
  const date = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  return { date, weekday: w.weekday, minuteOfDay: w.hour * 60 + w.minute };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The viewer's local calendar date. */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
