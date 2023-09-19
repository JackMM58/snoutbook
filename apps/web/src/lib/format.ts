import { zonedParts } from '@snoutbook/shared';

export { formatCents } from '@snoutbook/shared';

export function formatTime(iso: string | number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** 'YYYY-MM-DD' rendered as "Tue, Jun 2" without timezone drift. */
export function formatDay(date: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: style === 'long' ? 'long' : 'short',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** 'YYYY-MM-DD' rendered as "Jun 2, 2027". */
export function formatCalendarDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function todayIn(timeZone: string): string {
  return zonedParts(new Date(), timeZone).date;
}

export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function statusLabel(status: string): string {
  return status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}
