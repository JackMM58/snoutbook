-- Indexes for the Salon reports page.

CREATE INDEX appointments_completed_idx ON appointments (business_id, completed_at) WHERE status = 'completed';
CREATE INDEX appointments_pet_starts_idx ON appointments (pet_id, starts_at);
CREATE INDEX appointments_no_show_idx ON appointments (business_id, starts_at) WHERE status = 'no_show';
