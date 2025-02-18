import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db';
import { auth, requirePlan, requireRole } from '../lib/auth';
import { handle } from '../lib/errors';
import { getBusiness } from '../services/businesses';
import { getSalonReport } from '../services/reports';

export const reportsRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const reportQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    granularity: z.enum(['day', 'week', 'month']).default('day'),
  })
  .refine((q) => q.from <= q.to, 'from must be on or before to');

reportsRouter.get(
  '/',
  requirePlan('salon'),
  requireRole('owner', 'manager'),
  handle(async (req, res) => {
    const range = reportQuery.parse(req.query);
    const db = getPool();
    const business = await getBusiness(db, auth(req).businessId);
    res.json(await getSalonReport(db, business, range));
  }),
);
