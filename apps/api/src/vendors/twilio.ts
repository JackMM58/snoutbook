import twilio from 'twilio';
import { getConfig } from '../config';

let client: ReturnType<typeof twilio> | undefined;

function getClient() {
  if (!client) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = getConfig();
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return client;
}

export interface SentText {
  sid: string;
  segments: number;
}

/** Sends from the shared messaging service. All businesses text from the same number pool. */
export async function sendText(to: string, body: string): Promise<SentText> {
  const message = await getClient().messages.create({
    to,
    body,
    messagingServiceSid: getConfig().TWILIO_MESSAGING_SERVICE_SID,
  });
  return { sid: message.sid, segments: Number(message.numSegments) || 1 };
}

export function isValidTwilioRequest(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  return twilio.validateRequest(getConfig().TWILIO_AUTH_TOKEN, signature, url, params);
}
