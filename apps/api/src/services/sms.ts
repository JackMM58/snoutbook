import type { Db } from '../db';
import { sendText } from '../vendors/twilio';

export type SmsKind = 'reminder';

export interface OutboundSms {
  businessId: string;
  clientId: string | null;
  to: string;
  body: string;
  kind: SmsKind;
}

/**
 * Sends one text. Returns false if the client has opted out.
 */
export async function sendSms(db: Db, sms: OutboundSms): Promise<boolean> {
  if (sms.clientId) {
    const { rows } = await db.query<{ smsOptOut: boolean }>(
      'SELECT sms_opt_out AS "smsOptOut" FROM clients WHERE id = $1',
      [sms.clientId],
    );
    if (rows[0]?.smsOptOut) return false;
  }

  await sendText(sms.to, sms.body);
  return true;
}
