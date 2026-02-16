import { Router } from 'express';
import {
  createStorageSpaceSchema,
  updateStorageSpaceSchema,
  createStorageItemSchema,
  updateStorageItemSchema,
} from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as storageService from './service.js';

const router = Router();

// Spaces
router.get('/spaces', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const spaces = await storageService.getSpaces(req.householdId!);
    res.json(spaces);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/spaces',
  authenticate,
  requireHousehold,
  validate(createStorageSpaceSchema),
  async (req, res, next) => {
    try {
      const space = await storageService.createSpace(req.body, req.householdId!);
      res.status(201).json(space);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/spaces/:id',
  authenticate,
  requireHousehold,
  validate(updateStorageSpaceSchema),
  async (req, res, next) => {
    try {
      const space = await storageService.updateSpace(req.params.id, req.body, req.householdId!);
      res.json(space);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/spaces/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await storageService.deleteSpace(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/spaces/:id/items', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const items = await storageService.getSpaceItems(req.params.id);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// Items
router.post(
  '/items',
  authenticate,
  requireHousehold,
  validate(createStorageItemSchema),
  async (req, res, next) => {
    try {
      const item = await storageService.addItem(req.body, req.userId!);
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/items/:id', authenticate, requireHousehold, validate(updateStorageItemSchema), async (req, res, next) => {
  try {
    const item = await storageService.updateItem(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete('/items/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await storageService.removeItem(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Full inventory
router.get('/inventory', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const items = await storageService.getFullInventory(req.householdId!);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

export default router;
