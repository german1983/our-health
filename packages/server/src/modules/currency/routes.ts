import { Router } from 'express';
import { convertCurrencySchema } from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as currencyService from './service.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const currencies = await currencyService.getCurrencies();
    res.json(currencies);
  } catch (err) {
    next(err);
  }
});

router.get('/rates', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const rates = await currencyService.getRatesForHousehold(req.householdId!);
    res.json(rates);
  } catch (err) {
    next(err);
  }
});

router.post('/convert', authenticate, validate(convertCurrencySchema), async (req, res, next) => {
  try {
    const result = await currencyService.convertCurrency(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
