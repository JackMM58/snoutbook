import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '@snoutbook/shared';
import { computeSlots } from './availability';

const TZ = 'America/Los_Angeles';
const DATE = '2026-06-02';

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedToUtc(DATE, (h ?? 0) * 60 + (m ?? 0), TZ).getTime();
};
const window = (from: string, to: string) => ({ start: at(from), end: at(to) });
const times = (slots: number[]) =>
  slots.map((s) =>
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(s),
  );

const base = {
  workingHours: [window('09:00', '12:00')],
  busy: [],
  durationMinutes: 60,
  bufferMinutes: 0,
  stepMinutes: 30,
  notBefore: 0,
};

describe('computeSlots', () => {
  it('offers every step that fits inside working hours', () => {
    expect(times(computeSlots(base))).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });

  it('skips times that overlap an existing appointment', () => {
    const slots = computeSlots({ ...base, busy: [window('10:00', '11:00')] });
    expect(times(slots)).toEqual(['09:00', '11:00']);
  });

  it('keeps the buffer clear on both sides of an appointment', () => {
    const slots = computeSlots({
      ...base,
      workingHours: [window('09:00', '13:00')],
      busy: [window('10:00', '11:00')],
      bufferMinutes: 15,
      stepMinutes: 15,
    });
    expect(times(slots)).toEqual(['11:15', '11:30', '11:45', '12:00']);
  });

  it('handles split shifts', () => {
    const slots = computeSlots({ ...base, workingHours: [window('09:00', '10:00'), window('13:00', '14:30')] });
    expect(times(slots)).toEqual(['09:00', '13:00', '13:30']);
  });

  it('respects the booking lead time', () => {
    const slots = computeSlots({ ...base, notBefore: at('10:15') });
    expect(times(slots)).toEqual(['10:30', '11:00']);
  });

  it('returns nothing when the visit is longer than the shift', () => {
    expect(computeSlots({ ...base, durationMinutes: 240 })).toEqual([]);
  });
});
