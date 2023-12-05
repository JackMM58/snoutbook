import Stripe from 'stripe';
import { getConfig } from '../config';

let stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripe) stripe = new Stripe(getConfig().STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripe;
}
