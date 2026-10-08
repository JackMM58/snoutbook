# Architecture

Last reviewed October 2026.

## Pieces

```
browser ──► web (static React build)
   │
   └──► api (Express) ──► Postgres ◄── worker (polls scheduled_jobs)
            │                              │
            ├── Stripe (Connect, Checkout, Terminal)
            ├── S3 (pet photos, vaccine files)
            └── Twilio / Postmark ◄────────┘
```

- **api** (`apps/api/src/index.ts`) serves the public booking API (`/api/public/:slug`),
  the dashboard API (`/api/*`, bearer session), the calendar feed (`/ical/:token.ics`) and
  webhooks (`/webhooks/stripe`, `/webhooks/twilio`).
- **worker** (`apps/api/src/worker.ts`) is the same codebase run as a second process. It
  claims due rows from `scheduled_jobs` and sends reminders. See
  [ADR 0001](decisions/0001-postgres-job-queue.md).
- **web** (`apps/web`) is one React app with two surfaces: the client booking page at
  `/book/:slug` and the business dashboard under `/app`.
- **shared** (`packages/shared`) holds wire types, plan limits, size bands, pricing and
  the add-on catalog so the API and the dashboard agree on prices.

## Data

Plain SQL in `db/migrations`, applied by `npm run migrate`. No ORM; queries alias
columns to camelCase in SQL. Everything is scoped by `business_id`.

Main tables: `businesses`, `staff` (+ `staff_hours`), `clients`, `pets`,
`vaccine_records`, `pet_photos`, `services` (price and duration per size band as JSON),
`add_ons`, `appointments` (+ `appointment_add_ons`), `deposits`, `payments`,
`scheduled_jobs`, `sms_usage`, `vans`, `service_area_zips`.

## Booking flow

1. The booking page loads services (and groomers on Salon) from `/api/public/:slug`.
2. Availability (`services/availability.ts`) is each groomer's working hours for the day,
   minus their booked appointments, with the van's buffer minutes kept clear around each
   one (Mobile). See [ADR 0004](decisions/0004-mobile-buffer-minutes.md).
3. `POST /bookings` re-checks the slot, creates the client and pet if new, and creates the
   appointment under a per-groomer advisory lock.
4. If the business takes deposits, the client is sent to Stripe Checkout. The webhook marks
   the deposit paid, or cancels the booking if the session expires. See
   [ADR 0003](decisions/0003-deposits-via-stripe-checkout.md).
5. Two reminder jobs are queued: 48 hours and 2 hours before.

## Messaging

Reminders go out by text (Twilio, one shared messaging service) and email (Postmark).
Texts are one-way; the inbound webhook only records opt-outs. See
[ADR 0002](decisions/0002-one-way-sms-reminders.md). Every outbound text is logged to
`sms_usage`, which the SMS usage page and the monthly overage invoice count from.

## Checkout

Checkout opens once an appointment is checked in. Add-ons are added to the bill there.
The bill is service price + add-ons − paid deposit + tip. Payment is cash (recorded by
hand), a texted Stripe Checkout link, or a Stripe Terminal card reader. Card payments are
direct charges on the business's connected Stripe account with no application fee.
Completing payment marks the visit completed and queues the rebook reminder.
