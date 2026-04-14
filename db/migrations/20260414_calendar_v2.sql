-- New calendar loads a week per groomer at a time.

CREATE INDEX appointments_groomer_starts_idx ON appointments (groomer_id, starts_at)
  WHERE status IN ('booked', 'checked_in', 'completed');
