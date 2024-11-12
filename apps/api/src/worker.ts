import { setTimeout as sleep } from 'node:timers/promises';
import { getConfig } from './config';
import { closePool } from './db';
import { claimDueJobs, completeJob, failJob, type Job, type JobKind } from './services/jobs';
import { sendAppointmentReminder, sendRebookReminder } from './services/reminders';

const handlers: Record<JobKind, (job: Job) => Promise<void>> = {
  appointment_reminder: sendAppointmentReminder,
  rebook_reminder: sendRebookReminder,
};

let stopping = false;

async function runJob(job: Job): Promise<void> {
  try {
    await handlers[job.kind](job);
    await completeJob(job.id);
  } catch (err) {
    console.error(`[worker] job ${job.id} (${job.kind}) failed on attempt ${job.attempts}`, err);
    await failJob(job, err);
  }
}

async function tick(batchSize: number): Promise<number> {
  const jobs = await claimDueJobs(batchSize);
  // One at a time keeps us well under Twilio's per-number send rate.
  for (const job of jobs) await runJob(job);
  return jobs.length;
}

async function main(): Promise<void> {
  const { WORKER_POLL_MS, WORKER_BATCH_SIZE } = getConfig();
  console.log(`[worker] started, polling every ${WORKER_POLL_MS}ms`);

  while (!stopping) {
    try {
      const handled = await tick(WORKER_BATCH_SIZE);
      if (handled < WORKER_BATCH_SIZE) await sleep(WORKER_POLL_MS);
    } catch (err) {
      console.error('[worker] tick failed', err);
      await sleep(WORKER_POLL_MS);
    }
  }

  await closePool();
  console.log('[worker] stopped');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
