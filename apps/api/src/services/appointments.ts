import type { PoolClient } from 'pg';
import {
  serviceDuration,
  servicePrice,
  sizeForWeight,
  type AppointmentSource,
  type AppointmentStatus,
  type Service,
  type Size,
} from '@snoutbook/shared';
import { withTransaction, type Db } from '../db';
import { HttpError, notFound } from '../lib/errors';
import { getBusiness } from './businesses';
import { cancelPendingReminders, scheduleAppointmentReminders, scheduleRebookReminder } from './reminders';

const MINUTE = 60_000;

export interface AppointmentRow {
  id: string;
  businessId: string;
  clientId: string;
  petId: string;
  serviceId: string;
  groomerId: string;
  vanId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  size: Size;
  quotedPriceCents: number;
  source: AppointmentSource;
  notes: string | null;
  completedAt: Date | null;
}

export const APPOINTMENT_COLUMNS = `
  a.id, a.business_id AS "businessId", a.client_id AS "clientId", a.pet_id AS "petId",
  a.service_id AS "serviceId", a.groomer_id AS "groomerId", a.van_id AS "vanId",
  a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status, a.size,
  a.quoted_price_cents AS "quotedPriceCents", a.source,
  a.notes, a.completed_at AS "completedAt"`;

export async function getAppointment(db: Db, businessId: string, id: string, forUpdate = false): Promise<AppointmentRow> {
  const { rows } = await db.query<AppointmentRow>(
    `SELECT ${APPOINTMENT_COLUMNS} FROM appointments a WHERE a.id = $1 AND a.business_id = $2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id, businessId],
  );
  if (!rows[0]) throw notFound('Appointment');
  return rows[0];
}

/** Serialises bookings per groomer so two people can't take the same slot. */
async function lockGroomer(tx: PoolClient, groomerId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [groomerId]);
}

async function assertFree(tx: PoolClient, groomerId: string, startsAt: Date, endsAt: Date, ignoreId: string | null = null) {
  const { rows } = await tx.query(
    `SELECT 1 FROM appointments
      WHERE groomer_id = $1 AND status IN ('booked', 'checked_in')
        AND starts_at < $3 AND ends_at > $2
        AND ($4::uuid IS NULL OR id <> $4)
      LIMIT 1`,
    [groomerId, startsAt, endsAt, ignoreId],
  );
  if (rows.length > 0) throw new HttpError(409, 'That time is no longer free', 'slot_taken');
}

async function assertGroomer(tx: PoolClient, businessId: string, groomerId: string): Promise<void> {
  const { rows } = await tx.query('SELECT 1 FROM staff WHERE id = $1 AND business_id = $2', [groomerId, businessId]);
  if (rows.length === 0) throw notFound('Groomer');
}

async function vanForGroomer(tx: PoolClient, groomerId: string): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>('SELECT id FROM vans WHERE staff_id = $1', [groomerId]);
  return rows[0]?.id ?? null;
}

export interface NewAppointment {
  businessId: string;
  clientId: string;
  petId: string;
  serviceId: string;
  groomerId: string;
  startsAt: Date;
  source: AppointmentSource;
  notes?: string | null;
}

export async function createAppointment(tx: PoolClient, input: NewAppointment): Promise<AppointmentRow> {
  const { rows: services } = await tx.query<Pick<Service, 'pricesCents' | 'durationsMinutes'>>(
    `SELECT prices_cents AS "pricesCents", durations_minutes AS "durationsMinutes"
       FROM services WHERE id = $1 AND business_id = $2`,
    [input.serviceId, input.businessId],
  );
  const service = services[0];
  if (!service) throw notFound('Service');

  const { rows: pets } = await tx.query<{ weightLbs: number | null }>(
    'SELECT weight_lbs AS "weightLbs" FROM pets WHERE id = $1 AND client_id = $2',
    [input.petId, input.clientId],
  );
  if (!pets[0]) throw notFound('Pet');

  const size = sizeForWeight(pets[0].weightLbs);
  const endsAt = new Date(input.startsAt.getTime() + serviceDuration(service, size) * MINUTE);

  await assertGroomer(tx, input.businessId, input.groomerId);
  await lockGroomer(tx, input.groomerId);
  await assertFree(tx, input.groomerId, input.startsAt, endsAt);
  const vanId = await vanForGroomer(tx, input.groomerId);

  const { rows } = await tx.query<AppointmentRow>(
    `INSERT INTO appointments AS a
       (business_id, client_id, pet_id, service_id, groomer_id, van_id, starts_at, ends_at, size,
        quoted_price_cents, source, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${APPOINTMENT_COLUMNS}`,
    [
      input.businessId,
      input.clientId,
      input.petId,
      input.serviceId,
      input.groomerId,
      vanId,
      input.startsAt,
      endsAt,
      size,
      servicePrice(service, size),
      input.source,
      input.notes ?? null,
    ],
  );
  const appointment = rows[0]!;
  await scheduleAppointmentReminders(tx, appointment);
  return appointment;
}

export interface AppointmentPatch {
  startsAt?: Date;
  groomerId?: string;
  notes?: string | null;
}

export async function updateAppointment(businessId: string, id: string, patch: AppointmentPatch): Promise<AppointmentRow> {
  return withTransaction(async (tx) => {
    const current = await getAppointment(tx, businessId, id, true);
    if (current.status !== 'booked' && current.status !== 'checked_in') {
      throw new HttpError(409, `This appointment is ${current.status.replace('_', ' ')} and can't be moved`);
    }

    const startsAt = patch.startsAt ?? current.startsAt;
    const groomerId = patch.groomerId ?? current.groomerId;
    const timeChanged = startsAt.getTime() !== current.startsAt.getTime();
    const groomerChanged = groomerId !== current.groomerId;

    let endsAt = current.endsAt;
    let vanId = current.vanId;
    if (groomerChanged) {
      await assertGroomer(tx, businessId, groomerId);
      vanId = await vanForGroomer(tx, groomerId);
    }
    if (timeChanged || groomerChanged) {
      endsAt = new Date(startsAt.getTime() + (current.endsAt.getTime() - current.startsAt.getTime()));
      await lockGroomer(tx, groomerId);
      await assertFree(tx, groomerId, startsAt, endsAt, id);
    }

    const { rows } = await tx.query<AppointmentRow>(
      `UPDATE appointments AS a
          SET starts_at = $3, ends_at = $4, groomer_id = $5, van_id = $6, notes = $7, updated_at = now()
        WHERE a.id = $1 AND a.business_id = $2
        RETURNING ${APPOINTMENT_COLUMNS}`,
      [id, businessId, startsAt, endsAt, groomerId, vanId, patch.notes !== undefined ? patch.notes : current.notes],
    );
    const updated = rows[0]!;

    // Pending reminders carry the old time and groomer name in their payload.
    if (timeChanged || groomerChanged) {
      await cancelPendingReminders(tx, id);
    }
    if (timeChanged) {
      await scheduleAppointmentReminders(tx, updated);
    }

    return updated;
  });
}

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed', 'booked'],
  completed: [],
  cancelled: [],
  // Undo for a no-show marked by mistake.
  no_show: ['booked'],
};

export async function markCompleted(tx: PoolClient, appt: AppointmentRow): Promise<AppointmentRow> {
  const { rows } = await tx.query<AppointmentRow>(
    `UPDATE appointments AS a SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE a.id = $1 RETURNING ${APPOINTMENT_COLUMNS}`,
    [appt.id],
  );
  const completed = rows[0]!;
  const business = await getBusiness(tx, appt.businessId);
  await scheduleRebookReminder(
    tx,
    { id: completed.id, businessId: completed.businessId, clientId: completed.clientId, petId: completed.petId, completedAt: completed.completedAt! },
    business.rebookAfterWeeks,
  );
  return completed;
}

export async function setAppointmentStatus(businessId: string, id: string, status: AppointmentStatus): Promise<AppointmentRow> {
  return withTransaction(async (tx) => {
    const current = await getAppointment(tx, businessId, id, true);
    if (current.status === status) return current;
    if (!TRANSITIONS[current.status].includes(status)) {
      throw new HttpError(409, `Can't change a ${current.status.replace('_', ' ')} appointment to ${status.replace('_', ' ')}`);
    }

    if (status === 'completed') return markCompleted(tx, current);

    const { rows } = await tx.query<AppointmentRow>(
      `UPDATE appointments AS a SET status = $3, updated_at = now()
        WHERE a.id = $1 AND a.business_id = $2 RETURNING ${APPOINTMENT_COLUMNS}`,
      [id, businessId, status],
    );
    if (status === 'cancelled') {
      await cancelPendingReminders(tx, id);
    }
    return rows[0]!;
  });
}
