import { Router } from 'express';
import { z } from 'zod';
import type { StaffRole } from '@snoutbook/shared';
import { getPool } from '../db';
import { auth, requireStaff, signSession, verifyPassword } from '../lib/auth';
import { handle, HttpError } from '../lib/errors';
import { getBusiness } from '../services/businesses';

export const authRouter = Router();

const loginBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  handle(async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const { rows } = await getPool().query<{ id: string; businessId: string; role: StaffRole; passwordHash: string }>(
      `SELECT id, business_id AS "businessId", role, password_hash AS "passwordHash" FROM staff WHERE email = $1`,
      [email],
    );
    const staff = rows[0];
    if (!staff || !(await verifyPassword(password, staff.passwordHash))) {
      throw new HttpError(401, 'Email or password is incorrect', 'bad_credentials');
    }
    res.json({ token: signSession({ staffId: staff.id, businessId: staff.businessId, role: staff.role }) });
  }),
);

authRouter.get(
  '/me',
  requireStaff,
  handle(async (req, res) => {
    const { staffId, businessId } = auth(req);
    const db = getPool();
    const business = await getBusiness(db, businessId);
    const { rows } = await db.query<{ id: string; name: string; email: string; role: StaffRole }>(
      'SELECT id, name, email, role FROM staff WHERE id = $1',
      [staffId],
    );
    res.json({
      staff: rows[0],
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        plan: business.plan,
        timezone: business.timezone,
        phone: business.phone,
      },
    });
  }),
);
