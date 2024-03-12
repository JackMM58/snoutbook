import type { PlanId } from '@snoutbook/shared';
import type { Db } from '../db';
import { notFound } from '../lib/errors';

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  timezone: string;
  phone: string | null;
  email: string | null;
  depositCents: number | null;
  stripeAccountId: string | null;
  stripeCustomerId: string | null;
}

const COLUMNS = `
  id, name, slug, plan, timezone, phone,
  deposit_cents AS "depositCents",
  stripe_account_id AS "stripeAccountId",
  stripe_customer_id AS "stripeCustomerId",
  email`;

export async function getBusiness(db: Db, id: string): Promise<BusinessRow> {
  const { rows } = await db.query<BusinessRow>(`SELECT ${COLUMNS} FROM businesses WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Business');
  return rows[0];
}

export async function getBusinessBySlug(db: Db, slug: string): Promise<BusinessRow> {
  const { rows } = await db.query<BusinessRow>(`SELECT ${COLUMNS} FROM businesses WHERE slug = $1`, [
    slug.toLowerCase(),
  ]);
  if (!rows[0]) throw notFound('Business');
  return rows[0];
}
