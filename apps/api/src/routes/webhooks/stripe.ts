import { Router } from 'express';
import type Stripe from 'stripe';
import { getPool, withTransaction } from '../../db';
import { handle } from '../../lib/errors';
import { getAppointment, setAppointmentStatus } from '../../services/appointments';
import { cancelPendingPayment, finalizePayment } from '../../services/checkout';
import { markDepositExpired, markDepositPaid } from '../../services/deposits';
import { constructWebhookEvent } from '../../vendors/stripe';

// Mounted with express.raw() so the signature can be checked against the exact bytes.
export const stripeWebhookRouter = Router();

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  switch (session.metadata?.kind) {
    case 'deposit':
      await markDepositPaid(getPool(), session);
      break;
    case 'payment':
      if (session.metadata.paymentId) {
        await withTransaction((tx) => finalizePayment(tx, session.metadata!.paymentId!));
      }
      break;
  }
}

async function onCheckoutExpired(session: Stripe.Checkout.Session) {
  switch (session.metadata?.kind) {
    case 'deposit': {
      // The client never paid, so the slot goes back on the booking page.
      const expired = await markDepositExpired(getPool(), session.id);
      if (!expired) break;
      const appt = await getAppointment(getPool(), expired.businessId, expired.appointmentId);
      if (appt.status === 'booked') await setAppointmentStatus(appt.businessId, appt.id, 'cancelled');
      break;
    }
    case 'payment':
      if (session.metadata.paymentId) await cancelPendingPayment(getPool(), session.metadata.paymentId, 'cancelled');
      break;
  }
}

async function onPaymentIntent(intent: Stripe.PaymentIntent, succeeded: boolean) {
  if (intent.metadata.kind !== 'reader' || !intent.metadata.paymentId) return;
  if (succeeded) {
    await withTransaction((tx) => finalizePayment(tx, intent.metadata.paymentId!));
  } else {
    await cancelPendingPayment(getPool(), intent.metadata.paymentId, 'failed');
  }
}

stripeWebhookRouter.post(
  '/',
  handle(async (req, res) => {
    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(req.body as Buffer, req.header('stripe-signature') ?? '');
    } catch {
      res.status(400).send('Invalid signature');
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await onCheckoutExpired(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await onPaymentIntent(event.data.object, true);
        break;
      case 'payment_intent.payment_failed':
        await onPaymentIntent(event.data.object, false);
        break;
      default:
        break;
    }
    res.json({ received: true });
  }),
);
