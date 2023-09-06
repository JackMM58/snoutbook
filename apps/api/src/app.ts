import express, { Router } from 'express';
import { requireStaff } from './lib/auth';
import { errorHandler } from './lib/errors';
import { appointmentsRouter } from './routes/appointments';
import { authRouter } from './routes/auth';
import { clientsRouter } from './routes/clients';
import { publicBookingRouter } from './routes/publicBooking';
import { twilioWebhookRouter } from './routes/webhooks/twilio';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Webhooks parse their own bodies, so they're mounted before express.json().
  app.use('/webhooks/twilio', express.urlencoded({ extended: false }), twilioWebhookRouter);

  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicBookingRouter);

  const dashboard = Router();
  dashboard.use(requireStaff);
  dashboard.use('/appointments', appointmentsRouter);
  dashboard.use('/clients', clientsRouter);
  app.use('/api', dashboard);

  app.use(errorHandler);
  return app;
}
