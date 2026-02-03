# 0001: Use a Postgres table as the job queue

- Status: Accepted
- Date: 2023-08-09
- Deciders: Marcus, Sam

## Context

Reminders have to go out at a specific time, days after they're scheduled, and be
cancelled when an appointment is cancelled or moved. We're two engineers, we already
run Postgres, and the volume is small (a few thousand jobs a day at most for the
foreseeable future).

## Decision

Store jobs in a `scheduled_jobs` table with `run_at` and `status`. A worker process polls
every few seconds, claims due rows with `UPDATE ... RETURNING`, runs them, and marks them
done or reschedules them with backoff. Cancelling is an `UPDATE` in the same transaction
as the appointment change.

## Consequences

- No new infrastructure. Scheduling and cancelling are transactional with the booking.
- Polling adds up to `WORKER_POLL_MS` of delay, which is fine for reminders.
- Running more than one worker needs row locking on claim. Revisit (SKIP LOCKED, or a real
  queue) if we ever need more than one worker.

## Update, 2026-02-03

We now run two worker processes. Claims use `FOR UPDATE SKIP LOCKED`, and jobs left in
`running` for more than 10 minutes are put back as `pending`.
