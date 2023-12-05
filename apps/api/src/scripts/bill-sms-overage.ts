// Runs on the 1st of each month from the platform scheduler. Adds last month's
// extra texts to each business's next Snoutbook invoice.
import { closePool, getPool } from '../db';
import { getBusiness } from '../services/businesses';
import { invoiceOverage, monthOf } from '../services/smsUsage';

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

async function main() {
  const db = getPool();
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM businesses WHERE stripe_customer_id IS NOT NULL ORDER BY created_at`,
  );

  let billed = 0;
  for (const { id } of rows) {
    const business = await getBusiness(db, id);
    const month = process.argv[2] ?? previousMonth(monthOf(new Date(), business.timezone));
    try {
      const usage = await invoiceOverage(db, business, month);
      if (usage.overage > 0) {
        billed++;
        console.log(`${business.slug}: ${usage.sent}/${usage.quota} texts, ${usage.overage} over`);
      }
    } catch (err) {
      console.error(`${business.slug}: failed to bill ${month}`, err);
      process.exitCode = 1;
    }
  }
  console.log(`done, ${billed} business(es) billed for overage`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
