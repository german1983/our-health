import { Router } from 'express';
import {
  createCategorySchema,
  updateCategorySchema,
  createTransactionSchema,
  updateTransactionSchema,
  transactionQuerySchema,
  financeSummaryQuerySchema,
} from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as financeService from './service.js';

const router = Router();

// Categories
router.get('/categories', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const tree = await financeService.getCategoryTree(req.householdId!);
    res.json(tree);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/categories',
  authenticate,
  requireHousehold,
  validate(createCategorySchema),
  async (req, res, next) => {
    try {
      const category = await financeService.createCategory(req.body, req.householdId!);
      res.status(201).json(category);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/categories/:id',
  authenticate,
  requireHousehold,
  validate(updateCategorySchema),
  async (req, res, next) => {
    try {
      const category = await financeService.updateCategory(req.params.id, req.body, req.householdId!);
      res.json(category);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/categories/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await financeService.deleteCategory(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Transactions
router.get(
  '/transactions',
  authenticate,
  requireHousehold,
  validate(transactionQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await financeService.getTransactions(req.householdId!, req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/transactions',
  authenticate,
  requireHousehold,
  validate(createTransactionSchema),
  async (req, res, next) => {
    try {
      const transaction = await financeService.createTransaction(req.body, req.householdId!, req.userId!);
      res.status(201).json(transaction);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/transactions/:id',
  authenticate,
  requireHousehold,
  validate(updateTransactionSchema),
  async (req, res, next) => {
    try {
      const transaction = await financeService.updateTransaction(req.params.id, req.body, req.householdId!);
      res.json(transaction);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/transactions/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await financeService.deleteTransaction(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Summary
router.get(
  '/summary',
  authenticate,
  requireHousehold,
  validate(financeSummaryQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const summary = await financeService.getFinanceSummary(req.householdId!, req.query as any);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
