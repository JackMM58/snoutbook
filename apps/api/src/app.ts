import express, { Router } from 'express';
import { requireStaff } from './lib/auth';
import { errorHandler } from './lib/errors';
import { appointmentsRouter } from './routes/appointments';
import { authRouter } from './routes/auth';
import { checkoutRouter } from './routes/checkout';
import { clientsRouter } from './routes/clients';
import { icalRouter } from './routes/ical';
import { petsRouter } from './routes/pets';
import { publicBookingRouter } from './routes/publicBooking';
import { reportsRouter } from './routes/reports';
import { servicesRouter } from './routes/services';
import { settingsRouter } from './routes/settings';
import { staffRouter } from './routes/staff';
import { stripeWebhookRouter } from './routes/webhooks/stripe';
import { twilioWebhookRouter } from './routes/webhooks/twilio';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Webhooks parse their own bodies, so they're mounted before express.json().
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);
  app.use('/webhooks/twilio', express.urlencoded({ extended: false }), twilioWebhookRouter);

  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/ical', icalRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicBookingRouter);

  const dashboard = Router();
  dashboard.use(requireStaff);
  dashboard.use('/appointments', appointmentsRouter);
  dashboard.use('/clients', clientsRouter);
  dashboard.use('/staff', staffRouter);
  dashboard.use('/settings', settingsRouter);
  dashboard.use('/reports', reportsRouter);
  dashboard.use(servicesRouter);
  dashboard.use(petsRouter);
  dashboard.use(checkoutRouter);
  app.use('/api', dashboard);

  app.use(errorHandler);
  return app;
}
