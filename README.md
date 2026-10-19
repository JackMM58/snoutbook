# Snoutbook

Booking and client software for dog groomers: an online booking page for clients, and a
dashboard for the business (calendar, pet profiles, checkout, reports, settings).

## Layout

```
apps/api         Express API and the reminder worker (Postgres, Stripe, Twilio, Postmark)
apps/web         React app: public booking page (/book/:slug) and dashboard (/app)
packages/shared  Types, plans, size bands, pricing and add-on helpers used by both
db/migrations    Plain SQL migrations, applied in filename order
docs/            Architecture notes and decision records
website/         Marketing site: static HTML and CSS, no build step
```

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## Getting started

You need Node 22 (`nvm use`) and Postgres 15+.

```sh
cp .env.example .env          # fill in test-mode keys
createdb snoutbook_dev
npm install
npm run migrate
npm run seed                  # optional: a local Salon business to click around
npm run dev:api               # http://localhost:4000
npm run dev:web               # http://localhost:5173
npm run worker                # sends reminders; leave it running in another tab
```

The seeded booking page is at `http://localhost:5173/book/local-salon`. Sign in to the
dashboard at `/login` as `owner@example.com` with `SEED_OWNER_PASSWORD`.

### Webhooks in development

- Stripe: `stripe listen --forward-to localhost:4000/webhooks/stripe --forward-connect-to localhost:4000/webhooks/stripe`
- Twilio: point the messaging service's inbound URL at a tunnel to `/webhooks/twilio/inbound`,
  and set `API_BASE_URL` to the tunnel URL so signatures validate.

## Checks

```sh
npm run typecheck   # tsc --noEmit in every workspace
npm test            # vitest in every workspace
```

## Deploying

- The API (`npm start -w @snoutbook/api`) and worker (`npm run worker:prod -w @snoutbook/api`)
  run as two processes from the same build. Run migrations before rolling the API.
- `npm run bill-sms-overage -w @snoutbook/api` is scheduled for 06:00 UTC on the 1st of each month.
- The web app is a static build (`npm run build`) served behind the same domain as the API,
  with `/api`, `/ical` and `/webhooks` routed to the API.
