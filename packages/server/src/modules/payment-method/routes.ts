import { Router } from 'express';
import {
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
} from '@personal-budget/shared';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as paymentMethodService from './service.js';

const router = Router();

router.get('/', authenticate, requireHousehold, async (req, res, next) => {
  try {
    res.json(await paymentMethodService.list(req.householdId!));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireHousehold, validate(createPaymentMethodSchema), async (req, res, next) => {
  try {
    const row = await paymentMethodService.create(req.body, req.householdId!);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireHousehold, validate(updatePaymentMethodSchema), async (req, res, next) => {
  try {
    const row = await paymentMethodService.update(req.params.id, req.body, req.householdId!);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await paymentMethodService.remove(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
