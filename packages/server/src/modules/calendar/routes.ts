import { Router } from 'express';
import {
  createCalendarEntrySchema,
  updateCalendarEntrySchema,
  calendarRangeQuerySchema,
} from '@personal-budget/shared';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as calendarService from './service.js';

const router = Router();

// Raw entries (for the management list / editing).
router.get('/', authenticate, requireHousehold, async (req, res, next) => {
  try {
    res.json(await calendarService.listEntries(req.householdId!));
  } catch (err) {
    next(err);
  }
});

// Expanded occurrences within a date window (for the month grid / agenda).
router.get(
  '/occurrences',
  authenticate,
  requireHousehold,
  validate(calendarRangeQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { from, to } = req.query as unknown as { from: string; to: string };
      res.json(await calendarService.getOccurrences(req.householdId!, from, to));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  authenticate,
  requireHousehold,
  validate(createCalendarEntrySchema),
  async (req, res, next) => {
    try {
      const entry = await calendarService.createEntry(req.householdId!, req.userId!, req.body);
      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  authenticate,
  requireHousehold,
  validate(updateCalendarEntrySchema),
  async (req, res, next) => {
    try {
      const entry = await calendarService.updateEntry(req.params.id, req.householdId!, req.body);
      res.json(entry);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await calendarService.deleteEntry(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
