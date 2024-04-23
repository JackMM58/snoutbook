-- Mobile plan: vans, service-area ZIPs, client addresses and gate/parking notes.

ALTER TABLE businesses DROP CONSTRAINT businesses_plan_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_plan_check CHECK (plan IN ('solo', 'mobile', 'salon'));

CREATE TABLE vans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name            text NOT NULL,
  staff_id        uuid UNIQUE REFERENCES staff(id) ON DELETE SET NULL,
  -- Kept clear before and after each appointment on this van.
  buffer_minutes  smallint NOT NULL DEFAULT 15 CHECK (buffer_minutes BETWEEN 0 AND 180),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_area_zips (
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  zip          char(5) NOT NULL,
  PRIMARY KEY (business_id, zip)
);

ALTER TABLE clients
  ADD COLUMN address_line1 text,
  ADD COLUMN address_line2 text,
  ADD COLUMN city text,
  ADD COLUMN state char(2),
  ADD COLUMN zip char(5),
  ADD COLUMN gate_notes text;

ALTER TABLE appointments
  ADD COLUMN van_id uuid REFERENCES vans(id) ON DELETE SET NULL;
