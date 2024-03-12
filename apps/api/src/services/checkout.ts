import type { PoolClient } from 'pg';
import { computeBill, SIZE_LABELS, type Bill, type PaymentMethod, type PaymentStatus } from '@snoutbook/shared';
import { getConfig } from '../config';
import { withTransaction, type Db } from '../db';
import { HttpError, notFound } from '../lib/errors';
import { getStripe, onAccount } from '../vendors/stripe';
import { getAppointment, markCompleted, type AppointmentRow } from './appointments';
import { getBusiness, type BusinessRow } from './businesses';
import { depositCreditCents, getDeposit, markDepositApplied } from './deposits';
import { paymentLinkSms } from './messages';
import { sendSms } from './sms';

export interface AddOnLine {
  id: string;
  addOnId: string;
  label: string;
  priceCents: number;
}

export interface PaymentSummary {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  status: PaymentStatus;
  createdAt: Date;
}

export interface CheckoutView {
  appointment: AppointmentRow & { serviceName: string; petName: string; clientName: string };
  addOns: AddOnLine[];
  bill: Bill;
  depositCents: number;
  payments: PaymentSummary[];
}

async function loadAddOnLines(db: Db, appointmentId: string): Promise<AddOnLine[]> {
  const { rows } = await db.query<AddOnLine>(
    `SELECT id, add_on_id AS "addOnId", label, price_cents AS "priceCents"
       FROM appointment_add_ons WHERE appointment_id = $1 ORDER BY added_at`,
    [appointmentId],
  );
  return rows;
}

async function billFor(db: Db, appt: AppointmentRow, serviceName: string, tipCents: number) {
  const [addOns, deposit] = await Promise.all([loadAddOnLines(db, appt.id), getDeposit(db, appt.id)]);
  const depositCents = depositCreditCents(deposit);
  const bill = computeBill({
    service: { label: `${serviceName} (${SIZE_LABELS[appt.size]})`, priceCents: appt.quotedPriceCents },
    addOns,
    depositPaidCents: depositCents,
    tipCents,
  });
  return { addOns, bill, depositCents };
}

export async function getCheckout(db: Db, businessId: string, appointmentId: string, tipCents = 0): Promise<CheckoutView> {
  const appt = await getAppointment(db, businessId, appointmentId);
  const { rows } = await db.query<{ serviceName: string; petName: string; clientName: string }>(
    `SELECT sv.name AS "serviceName", p.name AS "petName", trim(c.first_name || ' ' || c.last_name) AS "clientName"
       FROM appointments a
       JOIN services sv ON sv.id = a.service_id
       JOIN pets p ON p.id = a.pet_id
       JOIN clients c ON c.id = a.client_id
      WHERE a.id = $1`,
    [appointmentId],
  );
  const names = rows[0]!;
  const { addOns, bill, depositCents } = await billFor(db, appt, names.serviceName, tipCents);
  const { rows: payments } = await db.query<PaymentSummary>(
    `SELECT id, method, amount_cents AS "amountCents", tip_cents AS "tipCents", status, created_at AS "createdAt"
       FROM payments WHERE appointment_id = $1 ORDER BY created_at`,
    [appointmentId],
  );
  return { appointment: { ...appt, ...names }, addOns, bill, depositCents, payments };
}

function assertCheckoutOpen(appt: AppointmentRow) {
  if (appt.status !== 'checked_in') {
    throw new HttpError(409, 'Check the appointment in before checkout', 'not_checked_in');
  }
}

async function hasPendingPayment(db: Db, appointmentId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM payments WHERE appointment_id = $1 AND status = 'pending'`, [appointmentId]);
  return rows.length > 0;
}

interface PaymentRequest {
  staffId: string;
  businessId: string;
  appointmentId: string;
  tipCents: number;
}

async function prepare(db: Db, req: PaymentRequest) {
  const view = await getCheckout(db, req.businessId, req.appointmentId, req.tipCents);
  assertCheckoutOpen(view.appointment);
  if (await hasPendingPayment(db, req.appointmentId)) {
    throw new HttpError(409, 'A payment is already in progress for this appointment', 'payment_pending');
  }
  return view;
}

/** Marks a payment succeeded and closes out the visit. Safe to call twice. */
export async function finalizePayment(tx: PoolClient, paymentId: string): Promise<void> {
  const { rows } = await tx.query<{ appointmentId: string; businessId: string; tipCents: number }>(
    `UPDATE payments SET status = 'succeeded', succeeded_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING appointment_id AS "appointmentId", business_id AS "businessId", tip_cents AS "tipCents"`,
    [paymentId],
  );
  const payment = rows[0];
  if (!payment) return;

  const appt = await getAppointment(tx, payment.businessId, payment.appointmentId, true);
  const addOns = await loadAddOnLines(tx, appt.id);
  const finalPrice = appt.quotedPriceCents + addOns.reduce((sum, a) => sum + a.priceCents, 0);
  await tx.query('UPDATE appointments SET final_price_cents = $2, tip_cents = $3 WHERE id = $1', [
    appt.id,
    finalPrice,
    payment.tipCents,
  ]);
  await markDepositApplied(tx, appt.id);
  if (appt.status === 'checked_in') await markCompleted(tx, appt);
}

export async function recordCashPayment(req: PaymentRequest): Promise<void> {
  await withTransaction(async (tx) => {
    const { bill } = await prepare(tx, req);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO payments (business_id, appointment_id, method, amount_cents, tip_cents, recorded_by)
       VALUES ($1, $2, 'cash', $3, $4, $5) RETURNING id`,
      [req.businessId, req.appointmentId, bill.totalDueCents - bill.tipCents, bill.tipCents, req.staffId],
    );
    await finalizePayment(tx, rows[0]!.id);
  });
}

function requireStripe(business: BusinessRow): string {
  if (!business.stripeAccountId) throw new HttpError(409, 'Connect Stripe to take card payments', 'stripe_not_connected');
  return business.stripeAccountId;
}

/** Texts the client a Stripe Checkout link for the balance. */
export async function sendPaymentLink(db: Db, req: PaymentRequest): Promise<{ url: string }> {
  const business = await getBusiness(db, req.businessId);
  const account = requireStripe(business);
  const { appointment, bill } = await prepare(db, req);
  if (bill.totalDueCents === 0) throw new HttpError(409, 'Nothing left to pay — record it as cash instead');

  const { rows: clients } = await db.query<{ phone: string | null; email: string | null }>(
    'SELECT phone, email FROM clients WHERE id = $1',
    [appointment.clientId],
  );
  const client = clients[0];
  if (!client?.phone) throw new HttpError(422, 'This client has no mobile number on file');

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO payments (business_id, appointment_id, method, amount_cents, tip_cents, recorded_by)
     VALUES ($1, $2, 'payment_link', $3, $4, $5) RETURNING id`,
    [req.businessId, req.appointmentId, bill.totalDueCents - bill.tipCents, bill.tipCents, req.staffId],
  );
  const paymentId = rows[0]!.id;
  const metadata = { kind: 'payment', paymentId, appointmentId: req.appointmentId };

  const session = await getStripe().checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: bill.totalDueCents,
            product_data: { name: `${appointment.petName} — ${appointment.serviceName}` },
          },
        },
      ],
      customer_email: client.email ?? undefined,
      success_url: `${getConfig().APP_BASE_URL}/paid`,
      metadata,
      payment_intent_data: { metadata },
    },
    onAccount(account),
  );
  await db.query('UPDATE payments SET stripe_checkout_session_id = $2 WHERE id = $1', [paymentId, session.id]);
  await sendSms(db, {
    businessId: req.businessId,
    clientId: appointment.clientId,
    to: client.phone,
    body: paymentLinkSms(business.name, bill.totalDueCents, session.url!),
    kind: 'payment_link',
  });
  return { url: session.url! };
}

export async function cancelPendingPayment(db: Db, paymentId: string, status: Extract<PaymentStatus, 'failed' | 'cancelled'>) {
  await db.query(`UPDATE payments SET status = $2 WHERE id = $1 AND status = 'pending'`, [paymentId, status]);
}
