import { Router } from 'express';
import { z } from 'zod';
import type { Service } from '@snoutbook/shared';
import { getPool } from '../db';
import { auth, requireRole } from '../lib/auth';
import { handle, notFound } from '../lib/errors';

export const servicesRouter = Router();

const SERVICE_COLUMNS = `id, name, description, prices_cents AS "pricesCents", durations_minutes AS "durationsMinutes", active`;

const sizeTable = (schema: z.ZodNumber) => z.object({ S: schema, M: schema, L: schema, XL: schema });

const serviceBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().default(null),
  pricesCents: sizeTable(z.number().int().min(0).max(100_000)),
  durationsMinutes: sizeTable(z.number().int().min(15).max(480).multipleOf(15)),
  active: z.boolean().default(true),
});

servicesRouter.get(
  '/services',
  handle(async (req, res) => {
    const { rows } = await getPool().query<Service>(
      `SELECT ${SERVICE_COLUMNS} FROM services WHERE business_id = $1 ORDER BY sort_order, name`,
      [auth(req).businessId],
    );
    res.json({ services: rows });
  }),
);

servicesRouter.post(
  '/services',
  requireRole('owner', 'manager'),
  handle(async (req, res) => {
    const s = serviceBody.parse(req.body);
    const { rows } = await getPool().query<Service>(
      `INSERT INTO services (business_id, name, description, prices_cents, durations_minutes, active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${SERVICE_COLUMNS}`,
      [auth(req).businessId, s.name, s.description, JSON.stringify(s.pricesCents), JSON.stringify(s.durationsMinutes), s.active],
    );
    res.status(201).json({ service: rows[0] });
  }),
);

servicesRouter.put(
  '/services/:id',
  requireRole('owner', 'manager'),
  handle(async (req, res) => {
    const s = serviceBody.parse(req.body);
    const { rows } = await getPool().query<Service>(
      `UPDATE services SET name = $3, description = $4, prices_cents = $5, durations_minutes = $6, active = $7
        WHERE id = $1 AND business_id = $2 RETURNING ${SERVICE_COLUMNS}`,
      [req.params.id, auth(req).businessId, s.name, s.description, JSON.stringify(s.pricesCents), JSON.stringify(s.durationsMinutes), s.active],
    );
    if (!rows[0]) throw notFound('Service');
    res.json({ service: rows[0] });
  }),
);
