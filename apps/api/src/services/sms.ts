import type { Db } from '../db';
import { sendText } from '../vendors/twilio';

export type SmsKind = 'reminder' | 'payment_link';

export interface OutboundSms {
  businessId: string;
  clientId: string | null;
  to: string;
  body: string;
  kind: SmsKind;
}

/**
 * Sends one text and logs it to sms_usage, which is what plan quotas and overage are
 * counted from. Returns false if the client has opted out.
 */
export async function sendSms(db: Db, sms: OutboundSms): Promise<boolean> {
  if (sms.clientId) {
    const { rows } = await db.query<{ smsOptOut: boolean }>(
      'SELECT sms_opt_out AS "smsOptOut" FROM clients WHERE id = $1',
      [sms.clientId],
    );
    if (rows[0]?.smsOptOut) return false;
  }

  const sent = await sendText(sms.to, sms.body);
  await db.query(
    `INSERT INTO sms_usage (business_id, client_id, kind, twilio_sid, segments) VALUES ($1, $2, $3, $4, $5)`,
    [sms.businessId, sms.clientId, sms.kind, sent.sid, sent.segments],
  );
  return true;
}
