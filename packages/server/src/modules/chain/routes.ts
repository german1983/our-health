import { Router } from 'express';
import { createChainSchema, updateChainSchema } from '@personal-budget/shared';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as chainService from './service.js';

const router = Router();

router.get('/', authenticate, async (_req, res, next) => {
  try {
    res.json(await chainService.listChains());
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, validate(createChainSchema), async (req, res, next) => {
  try {
    const chain = await chainService.createChain(req.body);
    res.status(201).json(chain);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, validate(updateChainSchema), async (req, res, next) => {
  try {
    const chain = await chainService.updateChain(req.params.id, req.body);
    res.json(chain);
  } catch (err) {
    next(err);
  }
});

export default router;
