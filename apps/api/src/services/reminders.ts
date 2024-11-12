import { getConfig } from '../config';
import { getPool, type Db } from '../db';
import { sendEmail } from '../vendors/postmark';
import { cancelPendingJobs, enqueueJob, type Job } from './jobs';
import {
  appointmentReminderEmail,
  appointmentReminderSms,
  rebookReminderEmail,
  rebookReminderSms,
  type ReminderContext,
} from './messages';
import { sendSms } from './sms';

const HOUR = 3_600_000;

export const REMINDER_OFFSETS_HOURS = [48, 2] as const;

export interface ReminderPayload {
  offsetHours: number;
  startsAt: string;
  groomerName: string;
  serviceName: string;
  petName: string;
}

/** When each reminder goes out. Any whose time has already passed is skipped. */
export function reminderRunTimes(startsAt: Date, now: Date = new Date()): { offsetHours: number; runAt: Date }[] {
  return REMINDER_OFFSETS_HOURS.map((offsetHours) => ({
    offsetHours,
    runAt: new Date(startsAt.getTime() - offsetHours * HOUR),
  })).filter(({ runAt }) => runAt.getTime() > now.getTime());
}

/** Lands at the same time of day as the visit, which keeps it inside business hours. */
export function rebookRunAt(completedAt: Date, weeks: number): Date {
  return new Date(completedAt.getTime() + weeks * 7 * 24 * HOUR);
}

interface ReminderTarget {
  id: string;
  businessId: string;
  clientId: string;
  petId: string;
  serviceId: string;
  groomerId: string;
  startsAt: Date;
}

export async function scheduleAppointmentReminders(db: Db, appt: ReminderTarget, now: Date = new Date()): Promise<void> {
  const runTimes = reminderRunTimes(appt.startsAt, now);
  if (runTimes.length === 0) return;

  // Names are snapshotted into the payload so the text matches what the client booked.
  const { rows } = await db.query<{ groomerName: string; serviceName: string; petName: string }>(
    `SELECT s.name AS "groomerName", sv.name AS "serviceName", p.name AS "petName"
       FROM staff s, services sv, pets p
      WHERE s.id = $1 AND sv.id = $2 AND p.id = $3`,
    [appt.groomerId, appt.serviceId, appt.petId],
  );
  const names = rows[0];
  if (!names) return;

  for (const { offsetHours, runAt } of runTimes) {
    const payload: ReminderPayload = { offsetHours, startsAt: appt.startsAt.toISOString(), ...names };
    await enqueueJob(db, {
      businessId: appt.businessId,
      kind: 'appointment_reminder',
      appointmentId: appt.id,
      clientId: appt.clientId,
      runAt,
      payload: { ...payload },
    });
  }
}

export async function cancelPendingReminders(db: Db, appointmentId: string): Promise<number> {
  return cancelPendingJobs(db, appointmentId, ['appointment_reminder']);
}

interface CompletedVisit {
  id: string;
  businessId: string;
  clientId: string;
  petId: string;
  completedAt: Date;
}

export async function scheduleRebookReminder(db: Db, visit: CompletedVisit, weeks: number | null): Promise<void> {
  if (!weeks) return;
  // One pending rebook reminder per pet; the latest visit replaces any earlier one.
  await db.query(
    `UPDATE scheduled_jobs SET status = 'cancelled', updated_at = now()
      WHERE kind = 'rebook_reminder' AND status = 'pending' AND client_id = $1 AND payload->>'petId' = $2`,
    [visit.clientId, visit.petId],
  );
  await enqueueJob(db, {
    businessId: visit.businessId,
    kind: 'rebook_reminder',
    appointmentId: visit.id,
    clientId: visit.clientId,
    runAt: rebookRunAt(visit.completedAt, weeks),
    payload: { petId: visit.petId, weeks },
  });
}

// Worker handlers

interface ReminderRecipient {
  status: string;
  clientId: string;
  firstName: string;
  phone: string | null;
  email: string | null;
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
  timezone: string;
}

export async function sendAppointmentReminder(job: Job): Promise<void> {
  const db = getPool();
  const payload = job.payload as unknown as ReminderPayload;
  const { rows } = await db.query<ReminderRecipient>(
    `SELECT a.status, c.id AS "clientId", c.first_name AS "firstName", c.phone, c.email,
            b.name AS "businessName", b.phone AS "businessPhone", b.email AS "businessEmail", b.timezone
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN businesses b ON b.id = a.business_id
      WHERE a.id = $1`,
    [job.appointmentId],
  );
  const r = rows[0];
  if (!r || r.status !== 'booked') return;

  const ctx: ReminderContext = {
    businessName: r.businessName,
    businessPhone: r.businessPhone,
    clientFirstName: r.firstName,
    petName: payload.petName,
    serviceName: payload.serviceName,
    groomerName: payload.groomerName,
    startsAt: new Date(payload.startsAt),
    timeZone: r.timezone,
    offsetHours: payload.offsetHours,
  };

  // FIXME: if the email fails after the text went out, the retry sends the text again.
  if (r.phone) {
    await sendSms(db, { businessId: job.businessId, clientId: r.clientId, to: r.phone, body: appointmentReminderSms(ctx), kind: 'reminder' });
  }
  if (r.email) {
    await sendEmail({ to: r.email, ...appointmentReminderEmail(ctx), tag: `reminder-${payload.offsetHours}h`, replyTo: r.businessEmail });
  }
}

export async function sendRebookReminder(job: Job): Promise<void> {
  const db = getPool();
  const { petId, weeks } = job.payload as { petId: string; weeks: number };

  const { rows } = await db.query<ReminderRecipient & { petName: string; slug: string }>(
    `SELECT c.id AS "clientId", c.first_name AS "firstName", c.phone, c.email, p.name AS "petName",
            b.name AS "businessName", b.email AS "businessEmail", b.slug
       FROM pets p
       JOIN clients c ON c.id = p.client_id
       JOIN businesses b ON b.id = p.business_id
      WHERE p.id = $1`,
    [petId],
  );
  const r = rows[0];
  if (!r) return;

  const ctx = {
    businessName: r.businessName,
    clientFirstName: r.firstName,
    petName: r.petName,
    weeks,
    bookingUrl: `${getConfig().APP_BASE_URL}/book/${r.slug}`,
  };
  if (r.phone) {
    await sendSms(db, { businessId: job.businessId, clientId: r.clientId, to: r.phone, body: rebookReminderSms(ctx), kind: 'rebook' });
  }
  if (r.email) {
    await sendEmail({ to: r.email, ...rebookReminderEmail(ctx), tag: 'rebook', replyTo: r.businessEmail });
  }
}
