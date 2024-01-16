import { Router } from 'express';
import { z } from 'zod';
import type { BusinessSettings } from '@snoutbook/shared';
import { getPool } from '../db';
import { auth, requireRole } from '../lib/auth';
import { handle, HttpError } from '../lib/errors';
import { getBusiness, type BusinessRow } from '../services/businesses';

export const settingsRouter = Router();

settingsRouter.use(requireRole('owner', 'manager'));

function toSettings(b: BusinessRow): BusinessSettings {
  return {
    name: b.name,
    phone: b.phone,
    timezone: b.timezone,
    depositCents: b.depositCents,
    rebookAfterWeeks: b.rebookAfterWeeks,
    stripeConnected: Boolean(b.stripeAccountId),
  };
}

settingsRouter.get(
  '/',
  handle(async (req, res) => {
    res.json({ settings: toSettings(await getBusiness(getPool(), auth(req).businessId)) });
  }),
);

const settingsBody = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).nullable(),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'Unknown timezone'),
  depositCents: z.number().int().min(500).max(20_000).nullable(),
  rebookAfterWeeks: z.number().int().min(1).max(26).nullable(),
});

settingsRouter.put(
  '/',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const s = settingsBody.parse(req.body);
    const db = getPool();
    const current = await getBusiness(db, businessId);
    if (s.depositCents && !current.stripeAccountId) {
      throw new HttpError(409, 'Connect Stripe before turning on deposits', 'stripe_not_connected');
    }
    await db.query(
      `UPDATE businesses SET name = $2, phone = $3, timezone = $4, deposit_cents = $5, rebook_after_weeks = $6 WHERE id = $1`,
      [businessId, s.name, s.phone, s.timezone, s.depositCents, s.rebookAfterWeeks],
    );
    res.json({ settings: toSettings(await getBusiness(db, businessId)) });
  }),
);
