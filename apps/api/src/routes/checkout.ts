import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db';
import { auth } from '../lib/auth';
import { handle, notFound } from '../lib/errors';
import { getBusiness } from '../services/businesses';
import {
  cancelPendingPayment,
  getCheckout,
  listCardReaders,
  recordCashPayment,
  sendPaymentLink,
  startReaderPayment,
} from '../services/checkout';

export const checkoutRouter = Router();

const tipQuery = z.object({ tipCents: z.coerce.number().int().min(0).default(0) });

checkoutRouter.get(
  '/appointments/:id/checkout',
  handle(async (req, res) => {
    const { tipCents } = tipQuery.parse(req.query);
    res.json(await getCheckout(getPool(), auth(req).businessId, req.params.id!, tipCents));
  }),
);

const paymentBody = z.discriminatedUnion('method', [
  z.object({ method: z.literal('cash'), tipCents: z.number().int().min(0) }),
  z.object({ method: z.literal('payment_link'), tipCents: z.number().int().min(0) }),
  z.object({ method: z.literal('card_reader'), tipCents: z.number().int().min(0), readerId: z.string().startsWith('tmr_') }),
]);

checkoutRouter.post(
  '/appointments/:id/payments',
  handle(async (req, res) => {
    const { businessId, staffId } = auth(req);
    const body = paymentBody.parse(req.body);
    const request = { staffId, businessId, appointmentId: req.params.id!, tipCents: body.tipCents };
    switch (body.method) {
      case 'cash':
        await recordCashPayment(request);
        res.status(201).json({ status: 'succeeded' });
        return;
      case 'payment_link':
        res.status(201).json({ status: 'pending', ...(await sendPaymentLink(getPool(), request)) });
        return;
      case 'card_reader':
        res.status(201).json({ status: 'pending', ...(await startReaderPayment(getPool(), { ...request, readerId: body.readerId })) });
        return;
    }
  }),
);

checkoutRouter.post(
  '/payments/:id/cancel',
  handle(async (req, res) => {
    const { rows } = await getPool().query('SELECT 1 FROM payments WHERE id = $1 AND business_id = $2', [
      req.params.id,
      auth(req).businessId,
    ]);
    if (rows.length === 0) throw notFound('Payment');
    await cancelPendingPayment(getPool(), req.params.id!, 'cancelled');
    res.status(204).end();
  }),
);

checkoutRouter.get(
  '/card-readers',
  handle(async (req, res) => {
    const business = await getBusiness(getPool(), auth(req).businessId);
    res.json({ readers: await listCardReaders(business) });
  }),
);
