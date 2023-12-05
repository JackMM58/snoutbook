-- Plans and billing for public launch, staff roles for Salon, and an outbound SMS log
-- that monthly usage and overage billing are counted from.

ALTER TABLE businesses
  ADD COLUMN plan text NOT NULL DEFAULT 'solo' CHECK (plan IN ('solo', 'salon')),
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN stripe_customer_id text;

ALTER TABLE staff
  ADD COLUMN role text NOT NULL DEFAULT 'groomer' CHECK (role IN ('owner', 'manager', 'groomer')),
  ADD COLUMN bookable boolean NOT NULL DEFAULT true,
  ADD COLUMN sort_order int NOT NULL DEFAULT 0;

-- Everyone who signed up during the beta owns their business.
UPDATE staff SET role = 'owner';

ALTER TABLE clients
  ADD COLUMN sms_opted_out_at timestamptz;

CREATE TABLE sms_usage (
  id           bigserial PRIMARY KEY,
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  kind         text NOT NULL,
  twilio_sid   text NOT NULL,
  segments     smallint NOT NULL DEFAULT 1,
  sent_at      timestamptz NOT NULL DEFAULT now()
);
