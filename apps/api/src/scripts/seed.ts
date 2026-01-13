// Seeds a local database with one Salon business so the dashboard and booking page
// have something to show. Refuses to run against production.
import { ADD_ON_CATALOG } from '@snoutbook/shared';
import { getConfig } from '../config';
import { closePool, withTransaction } from '../db';
import { hashPassword } from '../lib/auth';

const SLUG = 'local-salon';

async function main() {
  if (getConfig().NODE_ENV === 'production') throw new Error('seed is for local development only');
  const password = process.env.SEED_OWNER_PASSWORD ?? 'local-dev-only';

  await withTransaction(async (tx) => {
    const { rows: existing } = await tx.query('SELECT 1 FROM businesses WHERE slug = $1', [SLUG]);
    if (existing.length > 0) {
      console.log(`"${SLUG}" already exists, nothing to do`);
      return;
    }

    const { rows: [business] } = await tx.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, plan, timezone, phone, email, rebook_after_weeks)
       VALUES ('Local Salon', $1, 'salon', 'America/Los_Angeles', '(503) 555-0100', 'owner@example.com', 6)
       RETURNING id`,
      [SLUG],
    );
    const businessId = business!.id;

    const team = [
      { name: 'Owner Account', email: 'owner@example.com', role: 'owner', bookable: false, color: '#6b7280' },
      { name: 'Kim', email: 'kim@example.com', role: 'groomer', bookable: true, color: '#4f7cac' },
      { name: 'Luis', email: 'luis@example.com', role: 'groomer', bookable: true, color: '#c97b4a' },
      { name: 'Dee', email: 'dee@example.com', role: 'manager', bookable: true, color: '#5c9e6e' },
    ];
    const hash = await hashPassword(password);
    for (const [i, member] of team.entries()) {
      const { rows: [staff] } = await tx.query<{ id: string }>(
        `INSERT INTO staff (business_id, name, email, role, bookable, color, password_hash, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [businessId, member.name, member.email, member.role, member.bookable, member.color, hash, i],
      );
      if (!member.bookable) continue;
      // Tuesday to Saturday, 8:30 to 5.
      for (const weekday of [2, 3, 4, 5, 6]) {
        await tx.query('INSERT INTO staff_hours (staff_id, weekday, start_minute, end_minute) VALUES ($1, $2, 510, 1020)', [
          staff!.id,
          weekday,
        ]);
      }
    }

    const services = [
      { name: 'Full groom', prices: { S: 6000, M: 7500, L: 9000, XL: 11000 }, durations: { S: 90, M: 120, L: 150, XL: 180 } },
      { name: 'Bath & tidy', prices: { S: 4000, M: 5000, L: 6000, XL: 7500 }, durations: { S: 60, M: 75, L: 90, XL: 105 } },
      { name: 'Puppy intro', prices: { S: 3500, M: 3500, L: 4000, XL: 4000 }, durations: { S: 45, M: 45, L: 60, XL: 60 } },
    ];
    for (const [i, s] of services.entries()) {
      await tx.query(
        `INSERT INTO services (business_id, name, prices_cents, durations_minutes, sort_order) VALUES ($1, $2, $3, $4, $5)`,
        [businessId, s.name, JSON.stringify(s.prices), JSON.stringify(s.durations), i],
      );
    }

    for (const addOn of ADD_ON_CATALOG) {
      await tx.query('INSERT INTO add_ons (business_id, key, label, price_cents) VALUES ($1, $2, $3, $4)', [
        businessId,
        addOn.key,
        addOn.label,
        addOn.defaultPriceCents,
      ]);
    }

    const clients = [
      { first: 'Jamie', last: 'Lowe', phone: '+15035550111', email: 'jamie@example.com', pet: ['Biscuit', 'Cavapoo', 18] },
      { first: 'Morgan', last: 'Hale', phone: '+15035550122', email: 'morgan@example.com', pet: ['Juniper', 'Golden Retriever', 68] },
      { first: 'Chris', last: 'Ortiz', phone: '+15035550133', email: 'chris@example.com', pet: ['Pepper', 'Miniature Schnauzer', 16] },
    ] as const;
    for (const c of clients) {
      const { rows: [client] } = await tx.query<{ id: string }>(
        `INSERT INTO clients (business_id, first_name, last_name, phone, email) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [businessId, c.first, c.last, c.phone, c.email],
      );
      await tx.query('INSERT INTO pets (business_id, client_id, name, breed, weight_lbs) VALUES ($1, $2, $3, $4, $5)', [
        businessId,
        client!.id,
        ...c.pet,
      ]);
    }

    console.log(`Seeded "${SLUG}". Sign in as owner@example.com.`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
