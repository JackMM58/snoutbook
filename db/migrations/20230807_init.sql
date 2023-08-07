-- Core schema for the private beta.

CREATE TABLE businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  timezone    text NOT NULL DEFAULT 'America/Los_Angeles',
  phone       text,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  color          text NOT NULL DEFAULT '#4f7cac',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Weekly working hours, in minutes after local midnight.
CREATE TABLE staff_hours (
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute  smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute    smallint NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  CHECK (end_minute > start_minute)
);
CREATE INDEX staff_hours_staff_idx ON staff_hours (staff_id, weekday);

CREATE TABLE clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  first_name   text NOT NULL,
  last_name    text NOT NULL DEFAULT '',
  phone        text,
  email        text,
  sms_opt_out  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, phone)
);

CREATE TABLE pets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name               text NOT NULL,
  breed              text,
  weight_lbs         numeric(5,1),
  temperament_notes  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pets_client_idx ON pets (client_id);

-- prices_cents / durations_minutes are keyed by size band: {"S":..,"M":..,"L":..,"XL":..}
CREATE TABLE services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  prices_cents       jsonb NOT NULL,
  durations_minutes  jsonb NOT NULL,
  active             boolean NOT NULL DEFAULT true,
  sort_order         int NOT NULL DEFAULT 0
);

CREATE TABLE appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id),
  pet_id              uuid NOT NULL REFERENCES pets(id),
  service_id          uuid NOT NULL REFERENCES services(id),
  groomer_id          uuid NOT NULL REFERENCES staff(id),
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'booked'
                      CHECK (status IN ('booked', 'checked_in', 'completed', 'cancelled', 'no_show')),
  size                text NOT NULL CHECK (size IN ('S', 'M', 'L', 'XL')),
  quoted_price_cents  int NOT NULL,
  source              text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'dashboard')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX appointments_business_starts_idx ON appointments (business_id, starts_at);

-- Postgres-backed job queue. See docs/decisions/0001-postgres-job-queue.md.
CREATE TABLE scheduled_jobs (
  id              bigserial PRIMARY KEY,
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  appointment_id  uuid REFERENCES appointments(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  payload         jsonb NOT NULL DEFAULT '{}',
  run_at          timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  locked_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_jobs_due_idx ON scheduled_jobs (run_at) WHERE status = 'pending';
CREATE INDEX scheduled_jobs_appointment_idx ON scheduled_jobs (appointment_id);
