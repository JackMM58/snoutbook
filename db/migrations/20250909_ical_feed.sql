-- Per-staff secret token for the read-only calendar feed.

ALTER TABLE staff
  ADD COLUMN ical_token text UNIQUE;
