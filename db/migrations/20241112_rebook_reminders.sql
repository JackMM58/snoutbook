-- Rebook reminders go out N weeks after a completed visit. NULL turns them off.

ALTER TABLE businesses
  ADD COLUMN rebook_after_weeks smallint DEFAULT 6 CHECK (rebook_after_weeks BETWEEN 1 AND 26);

CREATE INDEX scheduled_jobs_rebook_idx ON scheduled_jobs (client_id, kind) WHERE status = 'pending';
