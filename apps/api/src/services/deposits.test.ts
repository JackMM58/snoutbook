import { describe, expect, it } from 'vitest';
import { computeBill } from '@snoutbook/shared';
import { buildDepositCheckoutParams, DEPOSIT_HOLD_MINUTES, depositCreditCents } from './deposits';

describe('buildDepositCheckoutParams', () => {
  const now = new Date('2026-05-01T16:00:00Z');
  const params = buildDepositCheckoutParams({
    depositId: 'dep-1',
    appointmentId: 'appt-1',
    amountCents: 2000,
    businessName: 'Riverside Grooming',
    petName: 'Biscuit',
    startsAt: new Date('2026-05-08T17:30:00Z'),
    timeZone: 'America/Chicago',
    clientEmail: 'pat@example.com',
    returnUrl: 'http://localhost:5173/book/riverside/confirmed',
    now,
  });

  it('charges the deposit once, for the configured amount', () => {
    expect(params.mode).toBe('payment');
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items![0]!.price_data!.unit_amount).toBe(2000);
  });

  it('tags the session and payment so the webhook can find the deposit', () => {
    expect(params.metadata).toEqual({ kind: 'deposit', depositId: 'dep-1', appointmentId: 'appt-1' });
    expect(params.payment_intent_data!.metadata).toEqual(params.metadata);
  });

  it('expires after the hold window', () => {
    expect(params.expires_at).toBe(now.getTime() / 1000 + DEPOSIT_HOLD_MINUTES * 60);
  });

  it('returns to the confirmation page with the outcome', () => {
    expect(params.success_url).toBe('http://localhost:5173/book/riverside/confirmed?appointment=appt-1&deposit=paid');
    expect(params.cancel_url).toContain('deposit=cancelled');
  });
});

describe('depositCreditCents', () => {
  it('only credits deposits that were paid', () => {
    expect(depositCreditCents({ amountCents: 2000, status: 'paid' })).toBe(2000);
    expect(depositCreditCents({ amountCents: 2000, status: 'applied' })).toBe(2000);
    expect(depositCreditCents({ amountCents: 2000, status: 'pending' })).toBe(0);
    expect(depositCreditCents({ amountCents: 2000, status: 'expired' })).toBe(0);
    expect(depositCreditCents(null)).toBe(0);
  });
});

describe('applying a deposit at checkout', () => {
  it('takes the deposit off the services, not the tip', () => {
    const bill = computeBill({
      service: { label: 'Full groom (L)', priceCents: 8000 },
      addOns: [{ label: 'De-shed treatment', priceCents: 2000 }],
      depositPaidCents: depositCreditCents({ amountCents: 2000, status: 'paid' }),
      tipCents: 1500,
    });
    expect(bill.subtotalCents).toBe(10000);
    expect(bill.depositCreditCents).toBe(2000);
    expect(bill.totalDueCents).toBe(9500);
  });

  it('caps the credit at the services total', () => {
    const bill = computeBill({
      service: { label: 'Nail trim', priceCents: 1500 },
      addOns: [],
      depositPaidCents: 2000,
      tipCents: 300,
    });
    expect(bill.depositCreditCents).toBe(1500);
    expect(bill.totalDueCents).toBe(300);
  });
});
