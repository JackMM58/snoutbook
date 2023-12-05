import { ServerClient } from 'postmark';
import { getConfig } from '../config';

let client: ServerClient | undefined;

function getClient(): ServerClient {
  if (!client) client = new ServerClient(getConfig().POSTMARK_SERVER_TOKEN);
  return client;
}

export interface Email {
  to: string;
  subject: string;
  textBody: string;
  /** Postmark tag, used to split delivery stats by message type. */
  tag: string;
  replyTo?: string | null;
}

export async function sendEmail(email: Email): Promise<string> {
  const result = await getClient().sendEmail({
    From: getConfig().POSTMARK_FROM_EMAIL,
    To: email.to,
    Subject: email.subject,
    TextBody: email.textBody,
    Tag: email.tag,
    ReplyTo: email.replyTo ?? undefined,
    MessageStream: 'outbound',
  });
  return result.MessageID;
}
