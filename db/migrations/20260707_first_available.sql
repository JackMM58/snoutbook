-- Salon booking page: clients can pick "first available" instead of a groomer.
-- Front desk can move these between groomers freely.

ALTER TABLE appointments
  ADD COLUMN any_groomer boolean NOT NULL DEFAULT false;
