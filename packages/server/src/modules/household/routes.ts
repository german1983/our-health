import { Router } from 'express';
import { createHouseholdSchema, joinHouseholdSchema } from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as householdService from './service.js';

const router = Router();

router.post('/', authenticate, validate(createHouseholdSchema), async (req, res, next) => {
  try {
    const result = await householdService.createHousehold(req.body, req.userId!);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/current', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const result = await householdService.getHousehold(req.householdId!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await householdService.getHousehold(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/invite-code', authenticate, async (req, res, next) => {
  try {
    const code = await householdService.getInviteCode(req.params.id, req.userId!);
    res.json({ code });
  } catch (err) {
    next(err);
  }
});

router.post('/join', authenticate, validate(joinHouseholdSchema), async (req, res, next) => {
  try {
    const result = await householdService.joinHousehold(req.body.code, req.userId!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/members', authenticate, async (req, res, next) => {
  try {
    const members = await householdService.getMembers(req.params.id);
    res.json(members);
  } catch (err) {
    next(err);
  }
});

export default router;
