import { Router } from 'express';
import { z } from 'zod';
import { PLANS, type BusinessSettings, type Van } from '@snoutbook/shared';
import { getConfig } from '../config';
import { getPool, withTransaction } from '../db';
import { auth, requirePlan, requireRole } from '../lib/auth';
import { handle, HttpError, notFound } from '../lib/errors';
import { getBusiness, type BusinessRow } from '../services/businesses';
import { getMonthlyUsage } from '../services/smsUsage';
import { getStripe } from '../vendors/stripe';

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

/** Starts (or resumes) Stripe Connect onboarding for the business's own account. */
settingsRouter.post(
  '/stripe/connect',
  requireRole('owner'),
  handle(async (req, res) => {
    const db = getPool();
    const business = await getBusiness(db, auth(req).businessId);
    const stripe = getStripe();
    let accountId = business.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        email: business.email ?? undefined,
        business_profile: { name: business.name },
        metadata: { businessId: business.id },
      });
      accountId = account.id;
      await db.query('UPDATE businesses SET stripe_account_id = $2 WHERE id = $1', [business.id, accountId]);
    }
    const appUrl = getConfig().APP_BASE_URL;
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${appUrl}/app/settings/business`,
      return_url: `${appUrl}/app/settings/business?stripe=connected`,
    });
    res.json({ url: link.url });
  }),
);

settingsRouter.get(
  '/sms-usage',
  handle(async (req, res) => {
    const db = getPool();
    const business = await getBusiness(db, auth(req).businessId);
    res.json({ usage: await getMonthlyUsage(db, business) });
  }),
);

// Mobile: service area and vans

settingsRouter.get(
  '/service-area',
  requirePlan('mobile'),
  handle(async (req, res) => {
    const { rows } = await getPool().query<{ zip: string }>(
      'SELECT zip FROM service_area_zips WHERE business_id = $1 ORDER BY zip',
      [auth(req).businessId],
    );
    res.json({ zips: rows.map((r) => r.zip) });
  }),
);

const serviceAreaBody = z.object({ zips: z.array(z.string().regex(/^\d{5}$/)).max(500) });

settingsRouter.put(
  '/service-area',
  requirePlan('mobile'),
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const zips = [...new Set(serviceAreaBody.parse(req.body).zips)].sort();
    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM service_area_zips WHERE business_id = $1', [businessId]);
      if (zips.length > 0) {
        await tx.query('INSERT INTO service_area_zips (business_id, zip) SELECT $1, unnest($2::text[])', [businessId, zips]);
      }
    });
    res.json({ zips });
  }),
);

const VAN_COLUMNS = `id, name, staff_id AS "staffId", buffer_minutes AS "bufferMinutes"`;

settingsRouter.get(
  '/vans',
  requirePlan('mobile'),
  handle(async (req, res) => {
    const { rows } = await getPool().query<Van>(
      `SELECT ${VAN_COLUMNS} FROM vans WHERE business_id = $1 ORDER BY created_at`,
      [auth(req).businessId],
    );
    res.json({ vans: rows });
  }),
);

const vanBody = z.object({
  name: z.string().trim().min(1).max(60),
  staffId: z.string().uuid().nullable(),
  bufferMinutes: z.number().int().min(0).max(180),
});

settingsRouter.post(
  '/vans',
  requirePlan('mobile'),
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const v = vanBody.parse(req.body);
    const db = getPool();
    const { rows: existing } = await db.query<{ count: number }>('SELECT count(*) AS count FROM vans WHERE business_id = $1', [businessId]);
    if ((existing[0]?.count ?? 0) >= PLANS.mobile.maxVans) {
      throw new HttpError(403, `The Mobile plan includes up to ${PLANS.mobile.maxVans} vans`, 'plan_limit');
    }
    const { rows } = await db.query<Van>(
      `INSERT INTO vans (business_id, name, staff_id, buffer_minutes) VALUES ($1, $2, $3, $4) RETURNING ${VAN_COLUMNS}`,
      [businessId, v.name, v.staffId, v.bufferMinutes],
    );
    res.status(201).json({ van: rows[0] });
  }),
);

settingsRouter.put(
  '/vans/:id',
  requirePlan('mobile'),
  handle(async (req, res) => {
    const v = vanBody.parse(req.body);
    const { rows } = await getPool().query<Van>(
      `UPDATE vans SET name = $3, staff_id = $4, buffer_minutes = $5 WHERE id = $1 AND business_id = $2 RETURNING ${VAN_COLUMNS}`,
      [req.params.id, auth(req).businessId, v.name, v.staffId, v.bufferMinutes],
    );
    if (!rows[0]) throw notFound('Van');
    res.json({ van: rows[0] });
  }),
);
