import { Router } from 'express';
import { z } from 'zod';
import { PLANS, type StaffMember } from '@snoutbook/shared';
import { getPool, withTransaction } from '../db';
import { auth, hashPassword, requireRole } from '../lib/auth';
import { handle, HttpError, notFound } from '../lib/errors';
import { getBusiness } from '../services/businesses';

export const staffRouter = Router();

const STAFF_COLUMNS = `id, name, email, role, color, bookable, sort_order AS "sortOrder"`;

staffRouter.get(
  '/',
  handle(async (req, res) => {
    const db = getPool();
    const { rows: staff } = await db.query<StaffMember>(
      `SELECT ${STAFF_COLUMNS} FROM staff WHERE business_id = $1 ORDER BY sort_order, created_at`,
      [auth(req).businessId],
    );
    const { rows: hours } = await db.query<{ staffId: string; weekday: number; startMinute: number; endMinute: number }>(
      `SELECT staff_id AS "staffId", weekday, start_minute AS "startMinute", end_minute AS "endMinute"
         FROM staff_hours WHERE staff_id = ANY($1) ORDER BY weekday, start_minute`,
      [staff.map((s) => s.id)],
    );
    res.json({ staff: staff.map((s) => ({ ...s, hours: hours.filter((h) => h.staffId === s.id) })) });
  }),
);

const newStaffBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: z.enum(['owner', 'manager', 'groomer']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#4f7cac'),
  bookable: z.boolean().default(true),
  temporaryPassword: z.string().min(10),
});

staffRouter.post(
  '/',
  requireRole('owner', 'manager'),
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const body = newStaffBody.parse(req.body);
    const db = getPool();
    const business = await getBusiness(db, businessId);
    const plan = PLANS[business.plan];

    if (body.bookable) {
      const { rows } = await db.query<{ count: number }>(
        'SELECT count(*) AS count FROM staff WHERE business_id = $1 AND bookable',
        [businessId],
      );
      if ((rows[0]?.count ?? 0) >= plan.maxGroomers) {
        throw new HttpError(403, `The ${plan.name} plan includes up to ${plan.maxGroomers} groomer${plan.maxGroomers === 1 ? '' : 's'}`, 'plan_limit');
      }
    }
    if (!plan.groomerColumns && body.role === 'manager') {
      throw new HttpError(403, 'Staff roles are part of the Salon plan', 'plan_required');
    }

    const { rows } = await db.query<StaffMember>(
      `INSERT INTO staff (business_id, name, email, role, color, bookable, password_hash, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(max(sort_order), 0) + 1 FROM staff WHERE business_id = $1))
       RETURNING ${STAFF_COLUMNS}`,
      [businessId, body.name, body.email, body.role, body.color, body.bookable, await hashPassword(body.temporaryPassword)],
    );
    res.status(201).json({ staff: rows[0] });
  }),
);

const hoursBody = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      }),
    )
    .max(21)
    .refine((hours) => hours.every((h) => h.endMinute > h.startMinute), 'Each shift has to end after it starts'),
});

staffRouter.put(
  '/:id/hours',
  requireRole('owner', 'manager'),
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const { hours } = hoursBody.parse(req.body);
    await withTransaction(async (tx) => {
      const { rows } = await tx.query('SELECT 1 FROM staff WHERE id = $1 AND business_id = $2', [req.params.id, businessId]);
      if (rows.length === 0) throw notFound('Staff member');
      await tx.query('DELETE FROM staff_hours WHERE staff_id = $1', [req.params.id]);
      for (const h of hours) {
        await tx.query('INSERT INTO staff_hours (staff_id, weekday, start_minute, end_minute) VALUES ($1, $2, $3, $4)', [
          req.params.id,
          h.weekday,
          h.startMinute,
          h.endMinute,
        ]);
      }
    });
    res.status(204).end();
  }),
);
