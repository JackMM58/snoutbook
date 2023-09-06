import { Router } from 'express';
import { getConfig } from '../../config';
import { getPool } from '../../db';
import { handle } from '../../lib/errors';
import { isValidTwilioRequest } from '../../vendors/twilio';

export const twilioWebhookRouter = Router();

// The carrier-standard opt-out keywords. Twilio also stops delivery on its side.
const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

twilioWebhookRouter.post(
  '/inbound',
  handle(async (req, res) => {
    const params = req.body as Record<string, string>;
    const url = `${getConfig().API_BASE_URL}/webhooks/twilio/inbound`;
    if (!isValidTwilioRequest(req.header('x-twilio-signature'), url, params)) {
      res.status(403).end();
      return;
    }

    const keyword = (params.Body ?? '').trim().toUpperCase();
    if (params.From && OPT_OUT_KEYWORDS.has(keyword)) {
      // Every business sends from the same messaging service, so an opt-out covers all of them.
      await getPool().query(
        `UPDATE clients SET sms_opt_out = true, sms_opted_out_at = now() WHERE phone = $1 AND NOT sms_opt_out`,
        [params.From],
      );
    }

    res.type('text/xml').send(EMPTY_TWIML);
  }),
);
