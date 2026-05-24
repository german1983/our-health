import { Router } from 'express';
import {
  createIntakeEntrySchema,
  updateIntakeEntrySchema,
  createServingUnitSchema,
  updateServingUnitSchema,
  dailyLogQuerySchema,
  intakeSummaryQuerySchema,
} from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as intakeService from './service.js';

const router = Router();

// Daily log
router.get('/log', authenticate, validate(dailyLogQuerySchema, 'query'), async (req, res, next) => {
  try {
    const log = await intakeService.getDailyLog(req.userId!, req.query.date as string);
    res.json(log);
  } catch (err) {
    next(err);
  }
});

// Intake entries
router.post('/entries', authenticate, validate(createIntakeEntrySchema), async (req, res, next) => {
  try {
    const entry = await intakeService.createEntry(req.userId!, req.body);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.patch('/entries/:id', authenticate, validate(updateIntakeEntrySchema), async (req, res, next) => {
  try {
    const entry = await intakeService.updateEntry(req.params.id, req.userId!, req.body);
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

router.delete('/entries/:id', authenticate, async (req, res, next) => {
  try {
    await intakeService.deleteEntry(req.params.id, req.userId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Serving units (custom unit conversions for a product). Household-shared:
// anyone in the household reads/writes the same list.
router.get('/serving-units', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const productId = req.query.productId as string;
    const units = await intakeService.getServingUnits(productId);
    res.json(units);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/serving-units',
  authenticate,
  requireHousehold,
  validate(createServingUnitSchema),
  async (req, res, next) => {
    try {
      const unit = await intakeService.createServingUnit(req.body);
      res.status(201).json(unit);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/serving-units/:id',
  authenticate,
  requireHousehold,
  validate(updateServingUnitSchema),
  async (req, res, next) => {
    try {
      const unit = await intakeService.updateServingUnit(req.params.id, req.body);
      res.json(unit);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/serving-units/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await intakeService.deleteServingUnit(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Summary
router.get('/summary', authenticate, validate(intakeSummaryQuerySchema, 'query'), async (req, res, next) => {
  try {
    const summary = await intakeService.getSummary(req.userId!, req.query.from as string, req.query.to as string);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
