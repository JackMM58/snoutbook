import { addDays, zonedToUtc, type ReportGranularity, type RevenuePoint, type SalonReport } from '@snoutbook/shared';
import type { Db } from '../db';
import type { BusinessRow } from './businesses';

/** A completed visit counts as rebooked if the next one was booked within this many days. */
const REBOOK_WINDOW_DAYS = 7;

export interface ReportRange {
  from: string;
  to: string;
  granularity: ReportGranularity;
}

export async function getSalonReport(db: Db, business: BusinessRow, range: ReportRange): Promise<SalonReport> {
  const tz = business.timezone;
  const start = zonedToUtc(range.from, 0, tz);
  const end = zonedToUtc(addDays(range.to, 1), 0, tz);
  const params = [business.id, start, end];

  const [revenue, rebook, noShows] = await Promise.all([
    db.query<RevenuePoint>(
      `SELECT to_char(date_trunc($4, a.completed_at AT TIME ZONE $5), 'YYYY-MM-DD') AS period,
              sum(a.final_price_cents)::int AS "revenueCents",
              COALESCE(sum(a.tip_cents), 0)::int AS "tipsCents"
         FROM appointments a
        WHERE a.business_id = $1 AND a.status = 'completed'
          AND a.completed_at >= $2 AND a.completed_at < $3
          AND a.final_price_cents IS NOT NULL
        GROUP BY 1
        ORDER BY 1`,
      [...params, range.granularity, tz],
    ),
    db.query<{ completed: number; rebooked: number }>(
      `SELECT count(*)::int AS completed,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM appointments n
                 WHERE n.pet_id = a.pet_id
                   AND n.starts_at > a.starts_at
                   AND n.status <> 'cancelled'
                   AND n.created_at <= a.completed_at + make_interval(days => $4)
              ))::int AS rebooked
         FROM appointments a
        WHERE a.business_id = $1 AND a.status = 'completed'
          AND a.completed_at >= $2 AND a.completed_at < $3`,
      [...params, REBOOK_WINDOW_DAYS],
    ),
    db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM appointments
        WHERE business_id = $1 AND status = 'no_show' AND starts_at >= $2 AND starts_at < $3`,
      params,
    ),
  ]);

  const { completed, rebooked } = rebook.rows[0] ?? { completed: 0, rebooked: 0 };
  return {
    from: range.from,
    to: range.to,
    granularity: range.granularity,
    revenue: revenue.rows,
    totalRevenueCents: revenue.rows.reduce((sum, r) => sum + r.revenueCents, 0),
    completedCount: completed,
    rebookRate: completed > 0 ? rebooked / completed : null,
    noShowCount: noShows.rows[0]?.count ?? 0,
  };
}
