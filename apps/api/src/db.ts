import pg from 'pg';
import { getConfig } from './config';

// DATE columns come back as 'YYYY-MM-DD' instead of a Date at local midnight.
pg.types.setTypeParser(1082, (value: string) => value);
// count(*) is int8 and numeric is a string by default; our values fit in a double.
pg.types.setTypeParser(20, (value: string) => Number(value));
pg.types.setTypeParser(1700, (value: string) => Number(value));

export type Db = pg.Pool | pg.PoolClient;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getConfig().DATABASE_URL, max: 10 });
    pool.on('error', (err) => console.error('[db] idle client error', err));
  }
  return pool;
}

export async function withTransaction<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
