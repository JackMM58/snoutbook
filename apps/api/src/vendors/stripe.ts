import Stripe from 'stripe';
import { getConfig } from '../config';

let stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripe) stripe = new Stripe(getConfig().STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripe;
}

/**
 * Charges are direct charges on the business's own connected account. We don't take an
 * application fee, so the business pays Stripe's standard rate and nothing else.
 */
export function onAccount(stripeAccountId: string): Stripe.RequestOptions {
  return { stripeAccount: stripeAccountId };
}

export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(rawBody, signature, getConfig().STRIPE_WEBHOOK_SECRET);
}
