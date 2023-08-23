import type { Db } from '../db';
import { notFound } from '../lib/errors';

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  email: string | null;
}

const COLUMNS = `
  id, name, slug, timezone, phone,
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
