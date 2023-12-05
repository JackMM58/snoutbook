import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { PlanId, StaffRole } from '@snoutbook/shared';
import { getConfig } from '../config';
import { getPool } from '../db';
import { handle, HttpError } from './errors';

export interface SessionClaims {
  staffId: string;
  businessId: string;
  role: StaffRole;
  exp: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function sign(payload: string): string {
  return crypto.createHmac('sha256', getConfig().SESSION_SECRET).update(payload).digest('base64url');
}

export function signSession(claims: Omit<SessionClaims, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...claims, exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string): SessionClaims | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
  return claims.exp > Date.now() / 1000 ? claims : null;
}

export const requireStaff: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization') ?? '';
  const claims = header.startsWith('Bearer ') ? verifySession(header.slice(7)) : null;
  if (!claims) {
    next(new HttpError(401, 'Sign in to continue', 'unauthenticated'));
    return;
  }
  req.auth = claims;
  next();
};

export function auth(req: Request): SessionClaims {
  if (!req.auth) throw new HttpError(401, 'Sign in to continue', 'unauthenticated');
  return req.auth;
}

export function requireRole(...roles: StaffRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(auth(req).role)) {
      next(new HttpError(403, "You don't have access to that", 'forbidden'));
      return;
    }
    next();
  };
}

export function requirePlan(...plans: PlanId[]): RequestHandler {
  return handle(async (req, _res, next) => {
    const { rows } = await getPool().query<{ plan: PlanId }>('SELECT plan FROM businesses WHERE id = $1', [
      auth(req).businessId,
    ]);
    if (!rows[0] || !plans.includes(rows[0].plan)) {
      throw new HttpError(403, 'Not included in your plan', 'plan_required');
    }
    next();
  });
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
