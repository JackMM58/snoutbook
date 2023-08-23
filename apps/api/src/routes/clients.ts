import { Router } from 'express';
import { z } from 'zod';
import type { Client, Pet } from '@snoutbook/shared';
import { getPool } from '../db';
import { auth } from '../lib/auth';
import { handle, HttpError, notFound } from '../lib/errors';
import { toE164 } from '../lib/phone';

export const clientsRouter = Router();

const CLIENT_COLUMNS = `id, first_name AS "firstName", last_name AS "lastName", phone, email,
  sms_opt_out AS "smsOptOut"`;

clientsRouter.get(
  '/',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const digits = q.replace(/\D/g, '');
    const { rows } = await getPool().query<Client>(
      `SELECT ${CLIENT_COLUMNS} FROM clients
        WHERE business_id = $1
          AND ($2 = '' OR (first_name || ' ' || last_name) ILIKE '%' || $2 || '%'
               OR ($3 <> '' AND phone LIKE '%' || $3 || '%'))
        ORDER BY last_name, first_name
        LIMIT 50`,
      [businessId, q, digits.length >= 4 ? digits : ''],
    );
    res.json({ clients: rows });
  }),
);

clientsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const db = getPool();
    const { rows } = await db.query<Client>(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = $1 AND business_id = $2`, [
      req.params.id,
      businessId,
    ]);
    if (!rows[0]) throw notFound('Client');
    const { rows: pets } = await db.query<Pet>(
      `SELECT id, client_id AS "clientId", name, breed, weight_lbs AS "weightLbs", coat_type AS "coatType",
              birthday, temperament_notes AS "temperamentNotes"
         FROM pets WHERE client_id = $1 ORDER BY created_at`,
      [req.params.id],
    );
    res.json({ client: rows[0], pets });
  }),
);

const clientBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(''),
  phone: z.string().nullable().default(null),
  email: z.string().email().nullable().default(null),
});

function normalisePhone(phone: string | null): string | null {
  if (!phone) return null;
  const e164 = toE164(phone);
  if (!e164) throw new HttpError(400, 'Phone number should be a 10-digit US number', 'bad_phone');
  return e164;
}

clientsRouter.post(
  '/',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const c = clientBody.parse(req.body);
    const { rows } = await getPool().query<Client>(
      `INSERT INTO clients (business_id, first_name, last_name, phone, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CLIENT_COLUMNS}`,
      [businessId, c.firstName, c.lastName, normalisePhone(c.phone), c.email],
    );
    res.status(201).json({ client: rows[0] });
  }),
);

clientsRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const c = clientBody.parse(req.body);
    const { rows } = await getPool().query<Client>(
      `UPDATE clients SET first_name = $3, last_name = $4, phone = $5, email = $6
        WHERE id = $1 AND business_id = $2
        RETURNING ${CLIENT_COLUMNS}`,
      [req.params.id, businessId, c.firstName, c.lastName, normalisePhone(c.phone), c.email],
    );
    if (!rows[0]) throw notFound('Client');
    res.json({ client: rows[0] });
  }),
);
