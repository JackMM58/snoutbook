import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { ADD_ON_CATALOG, PLANS, TRIAL_DAYS, type StaffRole } from '@snoutbook/shared';
import { getPool, withTransaction } from '../db';
import { auth, hashPassword, requireStaff, signSession, verifyPassword } from '../lib/auth';
import { handle, HttpError } from '../lib/errors';
import { getBusiness } from '../services/businesses';
import { getStripe } from '../vendors/stripe';

export const authRouter = Router();

const loginBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  handle(async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const { rows } = await getPool().query<{ id: string; businessId: string; role: StaffRole; passwordHash: string }>(
      `SELECT id, business_id AS "businessId", role, password_hash AS "passwordHash" FROM staff WHERE email = $1`,
      [email],
    );
    const staff = rows[0];
    if (!staff || !(await verifyPassword(password, staff.passwordHash))) {
      throw new HttpError(401, 'Email or password is incorrect', 'bad_credentials');
    }
    res.json({ token: signSession({ staffId: staff.id, businessId: staff.businessId, role: staff.role }) });
  }),
);

const signupBody = z.object({
  businessName: z.string().trim().min(2).max(100),
  plan: z.enum(['solo', 'mobile', 'salon']),
  timezone: z.string().default('America/Los_Angeles'),
  name: z.string().trim().min(1).max(80),
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(10),
});

async function uniqueSlug(tx: PoolClient, name: string): Promise<string> {
  const base = name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'groomer';
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { rows } = await tx.query('SELECT 1 FROM businesses WHERE slug = $1', [slug]);
    if (rows.length === 0) return slug;
  }
}

/** The sign-up form on the marketing site posts here. Trials need no card. */
authRouter.post(
  '/signup',
  handle(async (req, res) => {
    const body = signupBody.parse(req.body);
    const { rows: taken } = await getPool().query('SELECT 1 FROM staff WHERE email = $1', [body.email]);
    if (taken.length > 0) throw new HttpError(409, 'An account with that email already exists', 'email_taken');

    const { businessId, staffId } = await withTransaction(async (tx) => {
      const slug = await uniqueSlug(tx, body.businessName);
      const { rows: [business] } = await tx.query<{ id: string }>(
        `INSERT INTO businesses (name, slug, plan, timezone, email, trial_ends_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6)) RETURNING id`,
        [body.businessName, slug, body.plan, body.timezone, body.email, TRIAL_DAYS],
      );
      const { rows: [staff] } = await tx.query<{ id: string }>(
        `INSERT INTO staff (business_id, name, email, role, password_hash) VALUES ($1, $2, $3, 'owner', $4) RETURNING id`,
        [business!.id, body.name, body.email, await hashPassword(body.password)],
      );
      for (const addOn of ADD_ON_CATALOG) {
        await tx.query('INSERT INTO add_ons (business_id, key, label, price_cents) VALUES ($1, $2, $3, $4)', [
          business!.id,
          addOn.key,
          addOn.label,
          addOn.defaultPriceCents,
        ]);
      }
      return { businessId: business!.id, staffId: staff!.id };
    });

    // The subscription itself is created in Stripe Billing when the trial converts. We keep
    // the customer id so monthly SMS overage can be added to their invoice.
    const customer = await getStripe().customers.create({
      name: body.businessName,
      email: body.email,
      metadata: { businessId },
    });
    await getPool().query('UPDATE businesses SET stripe_customer_id = $2 WHERE id = $1', [businessId, customer.id]);

    res.status(201).json({ token: signSession({ staffId, businessId, role: 'owner' }) });
  }),
);

authRouter.get(
  '/me',
  requireStaff,
  handle(async (req, res) => {
    const { staffId, businessId } = auth(req);
    const db = getPool();
    const business = await getBusiness(db, businessId);
    const { rows } = await db.query<{ id: string; name: string; email: string; role: StaffRole }>(
      'SELECT id, name, email, role FROM staff WHERE id = $1',
      [staffId],
    );
    res.json({
      staff: rows[0],
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        plan: business.plan,
        timezone: business.timezone,
        phone: business.phone,
      },
      plan: PLANS[business.plan],
    });
  }),
);
