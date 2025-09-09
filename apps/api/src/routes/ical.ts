import { Router } from 'express';
import { getPool } from '../db';
import { handle } from '../lib/errors';
import { getFeedForToken } from '../services/ical';

// Public, read-only. The token in the URL is the only credential, which is how
// calendar apps subscribe to feeds.
export const icalRouter = Router();

icalRouter.get(
  '/:token.ics',
  handle(async (req, res) => {
    const body = await getFeedForToken(getPool(), req.params.token!);
    if (!body) {
      res.status(404).send('Not found');
      return;
    }
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=900');
    res.send(body);
  }),
);
