import { addDays, serviceDuration, weekdayOf, zonedToUtc, type AvailabilitySlot, type Service, type Size } from '@snoutbook/shared';
import type { Db } from '../db';
import { notFound } from '../lib/errors';
import type { BusinessRow } from './businesses';

const MINUTE = 60_000;
const STEP_MINUTES = 15;
/** Online bookings need at least this much notice. */
const LEAD_TIME_MINUTES = 120;

export interface Interval {
  start: number;
  end: number;
}

export interface SlotInput {
  /** Working windows for the day as epoch-ms intervals. */
  workingHours: Interval[];
  /** Appointments that still hold their time. */
  busy: Interval[];
  durationMinutes: number;
  stepMinutes: number;
  /** Nothing starting earlier than this is offered. */
  notBefore: number;
}

/** Start times (epoch ms) where a visit of `durationMinutes` fits. */
export function computeSlots(input: SlotInput): number[] {
  const duration = input.durationMinutes * MINUTE;
  const step = input.stepMinutes * MINUTE;

  const slots: number[] = [];
  for (const window of input.workingHours) {
    for (let start = window.start; start + duration <= window.end; start += step) {
      if (start < input.notBefore) continue;
      const end = start + duration;
      if (input.busy.some((b) => start < b.end && end > b.start)) continue;
      slots.push(start);
    }
  }
  return slots;
}

export interface AvailabilityQuery {
  date: string;
  serviceId: string;
  size: Size;
  /** A staff id, or 'any'. */
  groomerId: string;
}

export async function findAvailability(db: Db, business: BusinessRow, q: AvailabilityQuery): Promise<AvailabilitySlot[]> {
  const { rows: services } = await db.query<Pick<Service, 'durationsMinutes'>>(
    `SELECT durations_minutes AS "durationsMinutes" FROM services WHERE id = $1 AND business_id = $2 AND active`,
    [q.serviceId, business.id],
  );
  if (!services[0]) throw notFound('Service');
  const durationMinutes = serviceDuration(services[0], q.size);

  const { rows: groomers } = await db.query<{ id: string }>(
    `SELECT s.id FROM staff s
      WHERE s.business_id = $1 AND ($2::uuid IS NULL OR s.id = $2)
      ORDER BY s.created_at`,
    [business.id, q.groomerId === 'any' ? null : q.groomerId],
  );
  if (groomers.length === 0) return [];
  const groomerIds = groomers.map((g) => g.id);

  const tz = business.timezone;
  const dayStart = zonedToUtc(q.date, 0, tz);
  const dayEnd = zonedToUtc(addDays(q.date, 1), 0, tz);

  const { rows: hours } = await db.query<{ staffId: string; startMinute: number; endMinute: number }>(
    `SELECT staff_id AS "staffId", start_minute AS "startMinute", end_minute AS "endMinute"
       FROM staff_hours
      WHERE staff_id = ANY($1) AND weekday = $2`,
    [groomerIds, weekdayOf(q.date)],
  );
  const { rows: busy } = await db.query<{ groomerId: string; startsAt: Date; endsAt: Date }>(
    `SELECT groomer_id AS "groomerId", starts_at AS "startsAt", ends_at AS "endsAt"
       FROM appointments
      WHERE groomer_id = ANY($1)
        AND status NOT IN ('cancelled', 'no_show')
        AND starts_at < $3 AND ends_at > $2`,
    [groomerIds, dayStart, dayEnd],
  );

  const notBefore = Date.now() + LEAD_TIME_MINUTES * MINUTE;
  return groomers.flatMap((groomer) =>
    computeSlots({
      workingHours: hours
        .filter((h) => h.staffId === groomer.id)
        .map((h) => ({
          start: zonedToUtc(q.date, h.startMinute, tz).getTime(),
          end: zonedToUtc(q.date, h.endMinute, tz).getTime(),
        })),
      busy: busy
        .filter((b) => b.groomerId === groomer.id)
        .map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() })),
      durationMinutes,
      stepMinutes: STEP_MINUTES,
      notBefore,
    }).map((start) => ({ startsAt: new Date(start).toISOString(), groomerId: groomer.id })),
  );
}
