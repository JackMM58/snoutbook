import { PLANS, SMS_OVERAGE_CENTS, zonedParts, zonedToUtc, type PlanId, type SmsUsageSummary } from '@snoutbook/shared';
import type { Db } from '../db';
import { getStripe } from '../vendors/stripe';
import type { BusinessRow } from './businesses';

export function summarizeUsage(month: string, sent: number, plan: PlanId): SmsUsageSummary {
  const quota = PLANS[plan].smsQuota;
  const overage = Math.max(0, sent - quota);
  return { month, sent, quota, overage, overageCents: overage * SMS_OVERAGE_CENTS };
}

/** 'YYYY-MM' for an instant, in the business's timezone. */
export function monthOf(instant: Date, timeZone: string): string {
  return zonedParts(instant, timeZone).date.slice(0, 7);
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export async function getMonthlyUsage(db: Db, business: BusinessRow, month = monthOf(new Date(), business.timezone)): Promise<SmsUsageSummary> {
  const from = zonedToUtc(`${month}-01`, 0, business.timezone);
  const to = zonedToUtc(`${nextMonth(month)}-01`, 0, business.timezone);
  const { rows } = await db.query<{ sent: number }>(
    `SELECT count(*) AS sent FROM sms_usage WHERE business_id = $1 AND sent_at >= $2 AND sent_at < $3`,
    [business.id, from, to],
  );
  return summarizeUsage(month, rows[0]?.sent ?? 0, business.plan);
}

/** Adds last month's overage to the business's next Snoutbook invoice. */
export async function invoiceOverage(db: Db, business: BusinessRow, month: string): Promise<SmsUsageSummary> {
  const usage = await getMonthlyUsage(db, business, month);
  if (usage.overage === 0 || !business.stripeCustomerId) return usage;
  await getStripe().invoiceItems.create(
    {
      customer: business.stripeCustomerId,
      currency: 'usd',
      amount: usage.overageCents,
      description: `Extra texts, ${month}: ${usage.overage} over the ${usage.quota} included`,
      metadata: { kind: 'sms_overage', businessId: business.id, month },
    },
    { idempotencyKey: `sms-overage-${business.id}-${month}` },
  );
  return usage;
}
