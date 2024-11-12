import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db';
import { cancelPendingReminders, rebookRunAt, reminderRunTimes, scheduleAppointmentReminders } from './reminders';

const HOUR = 3_600_000;

function recordingDb() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM staff s, services sv, pets p')) {
      return { rows: [{ groomerName: 'Kim', serviceName: 'Full groom', petName: 'Biscuit' }], rowCount: 1 };
    }
    if (sql.trimStart().startsWith('INSERT INTO scheduled_jobs')) {
      return { rows: [{ id: calls.length }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { db: { query } as unknown as Db, calls };
}

const appt = {
  id: 'appt-1',
  businessId: 'biz-1',
  clientId: 'client-1',
  petId: 'pet-1',
  serviceId: 'svc-1',
  groomerId: 'staff-1',
  startsAt: new Date('2026-06-12T17:00:00Z'),
};

describe('reminderRunTimes', () => {
  it('sends 48 hours and 2 hours before the visit', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const runs = reminderRunTimes(appt.startsAt, now);
    expect(runs.map((r) => r.offsetHours)).toEqual([48, 2]);
    expect(runs[0]!.runAt.getTime()).toBe(appt.startsAt.getTime() - 48 * HOUR);
    expect(runs[1]!.runAt.getTime()).toBe(appt.startsAt.getTime() - 2 * HOUR);
  });

  it('skips the 48 hour reminder for a visit booked tomorrow', () => {
    const now = new Date(appt.startsAt.getTime() - 20 * HOUR);
    expect(reminderRunTimes(appt.startsAt, now).map((r) => r.offsetHours)).toEqual([2]);
  });

  it('schedules nothing for a same-hour booking', () => {
    const now = new Date(appt.startsAt.getTime() - HOUR);
    expect(reminderRunTimes(appt.startsAt, now)).toEqual([]);
  });
});

describe('scheduleAppointmentReminders', () => {
  it('queues one job per reminder with the booked names in the payload', async () => {
    const { db, calls } = recordingDb();
    await scheduleAppointmentReminders(db, appt, new Date('2026-06-01T12:00:00Z'));

    const inserts = calls.filter((c) => c.sql.includes('INSERT INTO scheduled_jobs'));
    expect(inserts).toHaveLength(2);
    const [first] = inserts;
    expect(first!.params[1]).toBe('appointment_reminder');
    expect(first!.params[2]).toBe('appt-1');
    expect(JSON.parse(first!.params[4] as string)).toMatchObject({
      offsetHours: 48,
      groomerName: 'Kim',
      petName: 'Biscuit',
      startsAt: '2026-06-12T17:00:00.000Z',
    });
    expect(first!.params[5]).toEqual(new Date('2026-06-10T17:00:00Z'));
  });

  it('does not touch the database when every reminder time has passed', async () => {
    const { db, calls } = recordingDb();
    await scheduleAppointmentReminders(db, appt, new Date(appt.startsAt.getTime() - 30 * 60_000));
    expect(calls).toHaveLength(0);
  });
});

describe('cancelPendingReminders', () => {
  it('cancels only pending appointment reminders for that appointment', async () => {
    const { db, calls } = recordingDb();
    await cancelPendingReminders(db, 'appt-1');
    expect(calls[0]!.sql).toMatch(/status = 'pending'/);
    expect(calls[0]!.params).toEqual(['appt-1', ['appointment_reminder']]);
  });
});

describe('rebookRunAt', () => {
  it('defaults to six weeks after the visit', () => {
    const completedAt = new Date('2026-03-03T18:30:00Z');
    expect(rebookRunAt(completedAt, 6)).toEqual(new Date('2026-04-14T18:30:00Z'));
  });
});
