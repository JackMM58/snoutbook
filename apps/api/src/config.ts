import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  // Where the web app lives; used for links in texts and Stripe return URLs.
  APP_BASE_URL: z.string().url(),
  // Public URL of this API; Twilio signs requests against it.
  API_BASE_URL: z.string().url(),

  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),

  TWILIO_ACCOUNT_SID: z.string().startsWith('AC'),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_MESSAGING_SERVICE_SID: z.string().startsWith('MG'),

  POSTMARK_SERVER_TOKEN: z.string().min(1),
  POSTMARK_FROM_EMAIL: z.string().email(),

  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-west-2'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),

  WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function getConfig(): Config {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
