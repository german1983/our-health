import { Router } from 'express';
import {
  confirmReceiptItemSchema,
  createReceiptSchema,
  supportedReceiptStores,
} from '@personal-budget/shared';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as receiptService from './service.js';

const router = Router();

router.post(
  '/',
  authenticate,
  requireHousehold,
  validate(createReceiptSchema),
  async (req, res, next) => {
    try {
      const { rawText, storeHint, storeId, currencyCode } = req.body as {
        rawText: string;
        storeHint?: string;
        storeId?: string;
        currencyCode: string;
      };
      const receipt = await receiptService.createReceipt({
        rawText,
        storeHint,
        storeId,
        currencyCode,
        householdId: req.householdId!,
        userId: req.userId!,
      });
      res.status(201).json(receipt);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const receipts = await receiptService.listReceipts(req.householdId!);
    res.json(receipts);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const receipt = await receiptService.getReceipt(req.params.id, req.householdId!);
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/raw', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const rawText = await receiptService.getReceiptRawText(req.params.id, req.householdId!);
    res.type('text/plain').send(rawText);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reparse', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const rawHint = typeof req.body?.storeHint === 'string' ? req.body.storeHint : undefined;
    const storeHint = rawHint ? supportedReceiptStores.parse(rawHint) : undefined;
    const receipt = await receiptService.reparseReceipt({
      receiptId: req.params.id,
      householdId: req.householdId!,
      storeHint,
    });
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/items/:itemId/confirm',
  authenticate,
  requireHousehold,
  validate(confirmReceiptItemSchema),
  async (req, res, next) => {
    try {
      const { productId, saveStoreCode } = req.body as {
        productId: string;
        saveStoreCode: boolean;
      };
      const result = await receiptService.confirmReceiptItem({
        receiptItemId: req.params.itemId,
        productId,
        saveStoreCode,
        householdId: req.householdId!,
        userId: req.userId!,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
