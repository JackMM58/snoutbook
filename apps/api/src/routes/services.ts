import { Router } from 'express';
import { z } from 'zod';
import { addOnPriceError, type AddOn, type Service } from '@snoutbook/shared';
import { getPool } from '../db';
import { auth, requireRole } from '../lib/auth';
import { handle, HttpError, notFound } from '../lib/errors';

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

servicesRouter.get(
  '/add-ons',
  handle(async (req, res) => {
    const { rows } = await getPool().query<AddOn>(
      `SELECT id, key, label, price_cents AS "priceCents", active FROM add_ons WHERE business_id = $1 ORDER BY label`,
      [auth(req).businessId],
    );
    res.json({ addOns: rows });
  }),
);

const addOnBody = z.object({
  priceCents: z.number().int(),
  active: z.boolean(),
});

servicesRouter.put(
  '/add-ons/:id',
  requireRole('owner', 'manager'),
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const body = addOnBody.parse(req.body);
    const db = getPool();
    const { rows: existing } = await db.query<Pick<AddOn, 'key'>>('SELECT key FROM add_ons WHERE id = $1 AND business_id = $2', [
      req.params.id,
      businessId,
    ]);
    if (!existing[0]) throw notFound('Add-on');
    const problem = addOnPriceError(existing[0].key, body.priceCents);
    if (problem) throw new HttpError(422, problem, 'bad_price');

    const { rows } = await db.query<AddOn>(
      `UPDATE add_ons SET price_cents = $3, active = $4 WHERE id = $1 AND business_id = $2
       RETURNING id, key, label, price_cents AS "priceCents", active`,
      [req.params.id, businessId, body.priceCents, body.active],
    );
    res.json({ addOn: rows[0] });
  }),
);
