import { getPool, type Db } from '../db';

export type JobKind = 'appointment_reminder' | 'rebook_reminder';

export interface Job {
  id: number;
  businessId: string;
  kind: JobKind;
  appointmentId: string | null;
  clientId: string | null;
  payload: Record<string, unknown>;
  runAt: Date;
  attempts: number;
}

export interface NewJob {
  businessId: string;
  kind: JobKind;
  runAt: Date;
  appointmentId?: string | null;
  clientId?: string | null;
  payload?: Record<string, unknown>;
}

const MAX_ATTEMPTS = 5;

const JOB_COLUMNS = `id, business_id AS "businessId", kind, appointment_id AS "appointmentId",
  client_id AS "clientId", payload, run_at AS "runAt", attempts`;

export async function enqueueJob(db: Db, job: NewJob): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO scheduled_jobs (business_id, kind, appointment_id, client_id, payload, run_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [job.businessId, job.kind, job.appointmentId ?? null, job.clientId ?? null, JSON.stringify(job.payload ?? {}), job.runAt],
  );
  return rows[0]!.id;
}

export async function cancelPendingJobs(db: Db, appointmentId: string, kinds: JobKind[]): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE scheduled_jobs SET status = 'cancelled', updated_at = now()
      WHERE appointment_id = $1 AND kind = ANY($2) AND status = 'pending'`,
    [appointmentId, kinds],
  );
  return rowCount ?? 0;
}

export async function claimDueJobs(limit: number): Promise<Job[]> {
  const { rows } = await getPool().query<Job>(
    `UPDATE scheduled_jobs
        SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM scheduled_jobs
         WHERE status = 'pending' AND run_at <= now()
         ORDER BY run_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING ${JOB_COLUMNS}`,
    [limit],
  );
  return rows;
}

export async function completeJob(id: number): Promise<void> {
  await getPool().query(`UPDATE scheduled_jobs SET status = 'done', updated_at = now() WHERE id = $1`, [id]);
}

export async function failJob(job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (job.attempts >= MAX_ATTEMPTS) {
    await getPool().query(
      `UPDATE scheduled_jobs SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`,
      [job.id, message],
    );
    return;
  }
  // Back off 1, 4, 9, 16 minutes.
  await getPool().query(
    `UPDATE scheduled_jobs
        SET status = 'pending', last_error = $2, run_at = now() + make_interval(mins => $3), updated_at = now()
      WHERE id = $1`,
    [job.id, message, job.attempts * job.attempts],
  );
}

/** Puts back jobs left 'running' by a worker that died mid-batch. */
export async function releaseStuckJobs(olderThanMinutes = 10): Promise<number> {
  const { rowCount } = await getPool().query(
    `UPDATE scheduled_jobs SET status = 'pending', locked_at = NULL, updated_at = now()
      WHERE status = 'running' AND locked_at < now() - make_interval(mins => $1)`,
    [olderThanMinutes],
  );
  return rowCount ?? 0;
}
