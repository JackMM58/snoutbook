import crypto from 'node:crypto';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config';

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    const config = getConfig();
    client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

/** businesses/<id>/pets/<petId>/<random>.<ext> — never the original file name. */
export function petFileKey(businessId: string, petId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  return `businesses/${businessId}/pets/${petId}/${crypto.randomUUID()}${ext}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function signedUrl(key: string, expiresInSeconds = 15 * 60): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
