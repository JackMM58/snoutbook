import type Stripe from 'stripe';
import type { DepositStatus } from '@snoutbook/shared';
import type { Db } from '../db';
import { HttpError } from '../lib/errors';
import { getStripe, onAccount } from '../vendors/stripe';
import type { BusinessRow } from './businesses';
import { formatVisitTime } from './messages';

/** Stripe's minimum Checkout lifetime. Unpaid bookings are released when it expires. */
export const DEPOSIT_HOLD_MINUTES = 30;

export interface DepositRow {
  id: string;
  appointmentId: string;
  amountCents: number;
  status: DepositStatus;
}

export interface DepositCheckoutInput {
  depositId: string;
  appointmentId: string;
  amountCents: number;
  businessName: string;
  petName: string;
  startsAt: Date;
  timeZone: string;
  clientEmail: string | null;
  returnUrl: string;
  now?: Date;
}

export function buildDepositCheckoutParams(input: DepositCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const now = input.now ?? new Date();
  const metadata = { kind: 'deposit', depositId: input.depositId, appointmentId: input.appointmentId };
  return {
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: input.amountCents,
          product_data: {
            name: `Deposit for ${input.petName} at ${input.businessName}`,
            description: `Comes off your bill on ${formatVisitTime(input.startsAt, input.timeZone)}`,
          },
        },
      },
    ],
    customer_email: input.clientEmail ?? undefined,
    success_url: `${input.returnUrl}?appointment=${input.appointmentId}&deposit=paid`,
    cancel_url: `${input.returnUrl}?appointment=${input.appointmentId}&deposit=cancelled`,
    expires_at: Math.floor(now.getTime() / 1000) + DEPOSIT_HOLD_MINUTES * 60,
    metadata,
    payment_intent_data: { metadata },
  };
}

/** How much a deposit takes off the final bill. Only money we actually have counts. */
export function depositCreditCents(deposit: Pick<DepositRow, 'amountCents' | 'status'> | null | undefined): number {
  if (!deposit) return 0;
  return deposit.status === 'paid' || deposit.status === 'applied' ? deposit.amountCents : 0;
}

export async function getDeposit(db: Db, appointmentId: string): Promise<DepositRow | null> {
  const { rows } = await db.query<DepositRow>(
    `SELECT id, appointment_id AS "appointmentId", amount_cents AS "amountCents", status
       FROM deposits WHERE appointment_id = $1`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

export async function createDepositCheckout(
  db: Db,
  business: BusinessRow,
  booking: { appointmentId: string; petName: string; startsAt: Date; clientEmail: string | null; returnUrl: string },
): Promise<string> {
  if (!business.depositCents) throw new HttpError(409, 'Deposits are turned off');
  if (!business.stripeAccountId) throw new HttpError(409, 'Connect Stripe before taking deposits', 'stripe_not_connected');

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO deposits (business_id, appointment_id, amount_cents) VALUES ($1, $2, $3) RETURNING id`,
    [business.id, booking.appointmentId, business.depositCents],
  );
  const depositId = rows[0]!.id;

  const session = await getStripe().checkout.sessions.create(
    buildDepositCheckoutParams({
      depositId,
      appointmentId: booking.appointmentId,
      amountCents: business.depositCents,
      businessName: business.name,
      petName: booking.petName,
      startsAt: booking.startsAt,
      timeZone: business.timezone,
      clientEmail: booking.clientEmail,
      returnUrl: booking.returnUrl,
    }),
    onAccount(business.stripeAccountId),
  );
  await db.query('UPDATE deposits SET stripe_checkout_session_id = $2 WHERE id = $1', [depositId, session.id]);
  if (!session.url) throw new Error(`Checkout session ${session.id} has no URL`);
  return session.url;
}

/** Returns the appointment id when this call moved the deposit to paid. */
export async function markDepositPaid(db: Db, session: Stripe.Checkout.Session): Promise<string | null> {
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const { rows } = await db.query<{ appointmentId: string }>(
    `UPDATE deposits SET status = 'paid', paid_at = now(), stripe_payment_intent_id = $2
      WHERE stripe_checkout_session_id = $1 AND status = 'pending'
      RETURNING appointment_id AS "appointmentId"`,
    [session.id, paymentIntentId ?? null],
  );
  return rows[0]?.appointmentId ?? null;
}

/** Returns the appointment id when this call expired the deposit. */
export async function markDepositExpired(db: Db, sessionId: string): Promise<{ appointmentId: string; businessId: string } | null> {
  const { rows } = await db.query<{ appointmentId: string; businessId: string }>(
    `UPDATE deposits SET status = 'expired'
      WHERE stripe_checkout_session_id = $1 AND status = 'pending'
      RETURNING appointment_id AS "appointmentId", business_id AS "businessId"`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function markDepositApplied(db: Db, appointmentId: string): Promise<void> {
  await db.query(`UPDATE deposits SET status = 'applied' WHERE appointment_id = $1 AND status = 'paid'`, [appointmentId]);
}
