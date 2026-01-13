-- Add-ons, priced per business and added to an appointment at checkout.

CREATE TABLE add_ons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key          text NOT NULL CHECK (key IN ('de_shed', 'nail_grind', 'teeth_brushing', 'flea_bath', 'matting_fee')),
  label        text NOT NULL,
  price_cents  int NOT NULL CHECK (price_cents >= 0),
  active       boolean NOT NULL DEFAULT true,
  UNIQUE (business_id, key),
  CHECK (key <> 'matting_fee' OR price_cents BETWEEN 1500 AND 4000)
);

-- Label and price are copied so later price changes don't rewrite old bills.
CREATE TABLE appointment_add_ons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  add_on_id       uuid NOT NULL REFERENCES add_ons(id),
  label           text NOT NULL,
  price_cents     int NOT NULL,
  added_by        uuid REFERENCES staff(id) ON DELETE SET NULL,
  added_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_add_ons_appointment_idx ON appointment_add_ons (appointment_id);

-- Give every existing business the standard list at default prices.
INSERT INTO add_ons (business_id, key, label, price_cents)
SELECT b.id, d.key, d.label, d.price_cents
  FROM businesses b
 CROSS JOIN (VALUES
   ('de_shed', 'De-shed treatment', 2000),
   ('nail_grind', 'Nail grind', 1200),
   ('teeth_brushing', 'Teeth brushing', 1000),
   ('flea_bath', 'Flea bath', 1800),
   ('matting_fee', 'Matting fee', 2500)
 ) AS d(key, label, price_cents);
