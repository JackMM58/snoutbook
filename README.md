# Snoutbook

Booking and reminders for dog groomers.

## Development

You need Node 20 (`nvm use`) and Postgres 15.

```sh
cp .env.example .env
createdb snoutbook_dev
npm install
npm run migrate
npm run dev:api
```

Migrations are plain SQL files in `db/migrations`, applied in filename order.
