import express, { Router } from 'express';
import { errorHandler } from './lib/errors';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  const dashboard = Router();
  app.use('/api', dashboard);

  app.use(errorHandler);
  return app;
}
