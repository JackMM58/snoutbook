import { Router } from 'express';
import { z } from 'zod';
import { addDays, APPOINTMENT_STATUSES, zonedToUtc, type CalendarAppointment } from '@snoutbook/shared';
import { getPool, withTransaction } from '../db';
import { auth } from '../lib/auth';
import { handle } from '../lib/errors';
import { APPOINTMENT_COLUMNS, createAppointment, setAppointmentStatus, updateAppointment } from '../services/appointments';
import { getBusiness } from '../services/businesses';

export const appointmentsRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const rangeQuery = z.object({ from: isoDate, to: isoDate });

appointmentsRouter.get(
  '/',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const { from, to } = rangeQuery.parse(req.query);
    const db = getPool();
    const business = await getBusiness(db, businessId);
    const { rows } = await db.query<CalendarAppointment>(
      `SELECT ${APPOINTMENT_COLUMNS},
              trim(c.first_name || ' ' || c.last_name) AS "clientName",
              p.name AS "petName", sv.name AS "serviceName"
         FROM appointments a
         JOIN clients c ON c.id = a.client_id
         JOIN pets p ON p.id = a.pet_id
         JOIN services sv ON sv.id = a.service_id
        WHERE a.business_id = $1 AND a.starts_at >= $2 AND a.starts_at < $3
          AND a.status <> 'cancelled'
        ORDER BY a.starts_at`,
      [businessId, zonedToUtc(from, 0, business.timezone), zonedToUtc(addDays(to, 1), 0, business.timezone)],
    );
    res.json({ appointments: rows });
  }),
);

const createBody = z.object({
  clientId: z.string().uuid(),
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  groomerId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  notes: z.string().max(2000).nullish(),
});

appointmentsRouter.post(
  '/',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const body = createBody.parse(req.body);
    const appointment = await withTransaction((tx) =>
      createAppointment(tx, { ...body, businessId, startsAt: new Date(body.startsAt), source: 'dashboard' }),
    );
    res.status(201).json({ appointment });
  }),
);

const patchBody = z.object({
  startsAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

appointmentsRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const body = patchBody.parse(req.body);
    const appointment = await updateAppointment(businessId, req.params.id!, {
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      notes: body.notes,
    });
    res.json({ appointment });
  }),
);

const statusBody = z.object({ status: z.enum(APPOINTMENT_STATUSES) });

appointmentsRouter.post(
  '/:id/status',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const { status } = statusBody.parse(req.body);
    const appointment = await setAppointmentStatus(businessId, req.params.id!, status);
    res.json({ appointment });
  }),
);
