import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { PLANS, sizeForWeight, zonedParts, type Service } from '@snoutbook/shared';
import { getConfig } from '../config';
import { getPool, withTransaction } from '../db';
import { handle, HttpError, notFound } from '../lib/errors';
import { toE164 } from '../lib/phone';
import { createAppointment } from '../services/appointments';
import { findAvailability } from '../services/availability';
import { getBusinessBySlug, type BusinessRow } from '../services/businesses';
import { createDepositCheckout } from '../services/deposits';

export const publicBookingRouter = Router();

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const groomerChoice = z.union([z.literal('any'), uuid]);

publicBookingRouter.get(
  '/:slug',
  handle(async (req, res) => {
    const db = getPool();
    const business = await getBusinessBySlug(db, req.params.slug!);
    const plan = PLANS[business.plan];
    const { rows: services } = await db.query<Service>(
      `SELECT id, name, description, prices_cents AS "pricesCents", durations_minutes AS "durationsMinutes", active
         FROM services WHERE business_id = $1 AND active ORDER BY sort_order, name`,
      [business.id],
    );
    const { rows: groomers } = plan.groomerColumns
      ? await db.query<{ id: string; name: string }>(
          'SELECT id, name FROM staff WHERE business_id = $1 AND bookable ORDER BY sort_order, created_at',
          [business.id],
        )
      : { rows: [] };

    res.json({
      business: {
        name: business.name,
        slug: business.slug,
        plan: business.plan,
        timezone: business.timezone,
        phone: business.phone,
        depositCents: business.stripeAccountId ? business.depositCents : null,
      },
      services,
      groomers,
    });
  }),
);

const availabilityQuery = z.object({
  serviceId: uuid,
  date: isoDate,
  size: z.enum(['S', 'M', 'L', 'XL']),
  groomerId: groomerChoice.default('any'),
});

publicBookingRouter.get(
  '/:slug/availability',
  handle(async (req, res) => {
    const db = getPool();
    const business = await getBusinessBySlug(db, req.params.slug!);
    const q = availabilityQuery.parse(req.query);
    res.json({ slots: await findAvailability(db, business, q) });
  }),
);

const lookupBody = z.object({ phone: z.string(), email: z.string().email() });

/** Returning clients confirm phone and email to see their pets. */
publicBookingRouter.post(
  '/:slug/lookup',
  handle(async (req, res) => {
    const db = getPool();
    const business = await getBusinessBySlug(db, req.params.slug!);
    const body = lookupBody.parse(req.body);
    const phone = toE164(body.phone);
    const { rows } = await db.query<{ id: string; firstName: string }>(
      `SELECT id, first_name AS "firstName" FROM clients
        WHERE business_id = $1 AND phone = $2 AND lower(email) = lower($3)`,
      [business.id, phone, body.email],
    );
    const client = rows[0];
    if (!client) throw new HttpError(404, "We couldn't find you. Book as a new client instead.", 'client_not_found');
    const { rows: pets } = await db.query<{ id: string; name: string; weightLbs: number | null }>(
      'SELECT id, name, weight_lbs AS "weightLbs" FROM pets WHERE client_id = $1 ORDER BY created_at',
      [client.id],
    );
    res.json({
      firstName: client.firstName,
      pets: pets.map((p) => ({ id: p.id, name: p.name, size: sizeForWeight(p.weightLbs) })),
    });
  }),
);

const bookingBody = z.object({
  serviceId: uuid,
  startsAt: z.string().datetime({ offset: true }),
  groomerId: groomerChoice,
  client: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).default(''),
    phone: z.string().min(7),
    email: z.string().email(),
  }),
  pet: z.union([
    z.object({ id: uuid }),
    z.object({
      name: z.string().trim().min(1).max(60),
      breed: z.string().trim().max(80).optional(),
      weightLbs: z.number().positive().max(250),
    }),
  ]),
});
type BookingBody = z.infer<typeof bookingBody>;

async function upsertClient(tx: PoolClient, businessId: string, phone: string, c: BookingBody['client']): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO clients (business_id, first_name, last_name, phone, email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (business_id, phone) DO UPDATE SET email = COALESCE(clients.email, EXCLUDED.email)
     RETURNING id`,
    [businessId, c.firstName, c.lastName, phone, c.email.toLowerCase()],
  );
  return rows[0]!.id;
}

async function resolvePet(tx: PoolClient, businessId: string, clientId: string, pet: BookingBody['pet']) {
  if ('id' in pet) {
    const { rows } = await tx.query<{ id: string; name: string; weightLbs: number | null }>(
      'SELECT id, name, weight_lbs AS "weightLbs" FROM pets WHERE id = $1 AND client_id = $2',
      [pet.id, clientId],
    );
    if (!rows[0]) throw notFound('Pet');
    return rows[0];
  }
  const { rows } = await tx.query<{ id: string; name: string; weightLbs: number | null }>(
    `INSERT INTO pets (business_id, client_id, name, breed, weight_lbs) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, weight_lbs AS "weightLbs"`,
    [businessId, clientId, pet.name, pet.breed ?? null, pet.weightLbs],
  );
  return rows[0]!;
}

publicBookingRouter.post(
  '/:slug/bookings',
  handle(async (req, res) => {
    const business = await getBusinessBySlug(getPool(), req.params.slug!);
    const body = bookingBody.parse(req.body);
    const plan = PLANS[business.plan];
    const phone = toE164(body.client.phone);
    if (!phone) throw new HttpError(400, 'Please enter a US mobile number', 'bad_phone');
    if (!plan.groomerColumns && body.groomerId !== 'any') {
      throw new HttpError(400, 'Groomer choice is not available for this business');
    }

    const startsAt = new Date(body.startsAt);
    const booking = await withTransaction(async (tx) => {
      const clientId = await upsertClient(tx, business.id, phone, body.client);
      const pet = await resolvePet(tx, business.id, clientId, body.pet);

      // Re-check against live availability so stale pages and hand-built requests can't
      // book outside working hours.
      const slots = await findAvailability(tx, business, {
        date: zonedParts(startsAt, business.timezone).date,
        serviceId: body.serviceId,
        size: sizeForWeight(pet.weightLbs),
        groomerId: body.groomerId,
      });
      const slot = slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
      if (!slot) throw new HttpError(409, 'Sorry, that time was just taken. Please pick another.', 'slot_taken');

      const appointment = await createAppointment(tx, {
        businessId: business.id,
        clientId,
        petId: pet.id,
        serviceId: body.serviceId,
        groomerId: slot.groomerId,
        startsAt,
        source: 'online',
      });
      return { appointment, petName: pet.name };
    });

    let checkoutUrl: string | null = null;
    if (business.depositCents && business.stripeAccountId) {
      checkoutUrl = await createDepositCheckout(getPool(), business, {
        appointmentId: booking.appointment.id,
        petName: booking.petName,
        startsAt,
        clientEmail: body.client.email,
        returnUrl: `${getConfig().APP_BASE_URL}/book/${business.slug}/confirmed`,
      });
    }

    res.status(201).json({
      appointmentId: booking.appointment.id,
      startsAt: booking.appointment.startsAt,
      checkoutUrl,
    });
  }),
);
