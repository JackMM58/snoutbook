-- In-person card payments with Stripe Terminal readers.

ALTER TABLE businesses
  ADD COLUMN stripe_terminal_location_id text;

ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('card_reader', 'payment_link', 'cash'));

ALTER TABLE payments
  ADD COLUMN stripe_reader_id text;

CREATE UNIQUE INDEX payments_payment_intent_idx ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
