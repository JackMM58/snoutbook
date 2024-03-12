import { Router } from 'express';
import { z } from 'zod';
import type { BusinessSettings } from '@snoutbook/shared';
import { getConfig } from '../config';
import { getPool } from '../db';
import { auth, requireRole } from '../lib/auth';
import { handle, HttpError } from '../lib/errors';
import { getBusiness, type BusinessRow } from '../services/businesses';
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
