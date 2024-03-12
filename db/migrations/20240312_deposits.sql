-- Deposits at online booking (Stripe Checkout) and checkout payments.
-- Businesses take payments on their own connected Stripe account.

ALTER TABLE businesses
  ADD COLUMN stripe_account_id text,
  ADD COLUMN deposit_cents int CHECK (deposit_cents IS NULL OR deposit_cents > 0);

CREATE TABLE deposits (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id              uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  amount_cents                int NOT NULL CHECK (amount_cents > 0),
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'paid', 'expired', 'applied')),
  stripe_checkout_session_id  text UNIQUE,
  stripe_payment_intent_id    text,
  paid_at                     timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id              uuid NOT NULL REFERENCES appointments(id),
  method                      text NOT NULL CHECK (method IN ('payment_link', 'cash')),
  -- What was collected at checkout, excluding tip (the deposit is already off).
  amount_cents                int NOT NULL CHECK (amount_cents >= 0),
  tip_cents                   int NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  stripe_checkout_session_id  text UNIQUE,
  stripe_payment_intent_id    text,
  recorded_by                 uuid REFERENCES staff(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  succeeded_at                timestamptz
);
CREATE INDEX payments_appointment_idx ON payments (appointment_id);

ALTER TABLE appointments
  ADD COLUMN completed_at timestamptz,
  -- Final services total (before deposit and tip), written when checkout completes.
  ADD COLUMN final_price_cents int,
  ADD COLUMN tip_cents int;
