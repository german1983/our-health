import { Router } from 'express';
import {
  confirmReceiptItemSchema,
  createReceiptSchema,
  matchReceiptItemSchema,
  setItemFinanceCategorySchema,
  setItemTaxCategorySchema,
  supportedReceiptStores,
  updateReceiptItemSchema,
  updateReceiptSchema,
  type UpdateReceiptInput,
  type UpdateReceiptItemInput,
} from '@personal-budget/shared';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as receiptService from './service.js';

const router = Router();

router.get('/tax-categories', authenticate, async (_req, res, next) => {
  try {
    const categories = await receiptService.listTaxCategories();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  authenticate,
  requireHousehold,
  validate(createReceiptSchema),
  async (req, res, next) => {
    try {
      const { imageBase64, storeHint, storeId, currencyCode } = req.body as {
        imageBase64: string;
        storeHint?: string;
        storeId?: string;
        currencyCode: string;
      };
      const receipt = await receiptService.createReceipt({
        imageBase64,
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

router.patch(
  '/items/:itemId/product',
  authenticate,
  requireHousehold,
  validate(matchReceiptItemSchema),
  async (req, res, next) => {
    try {
      const { productId, saveChainCode, applyToReceipt } = req.body as {
        productId: string | null;
        saveChainCode: boolean;
        applyToReceipt: boolean;
      };
      const receipt = await receiptService.matchReceiptItem({
        receiptItemId: req.params.itemId,
        productId,
        saveChainCode,
        applyToReceipt,
        householdId: req.householdId!,
        userId: req.userId!,
      });
      res.json(receipt);
    } catch (err) {
      next(err);
    }
  },
);

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

router.patch(
  '/:id',
  authenticate,
  requireHousehold,
  validate(updateReceiptSchema),
  async (req, res, next) => {
    try {
      const receipt = await receiptService.updateReceiptHeader({
        receiptId: req.params.id,
        householdId: req.householdId!,
        data: req.body as UpdateReceiptInput,
      });
      res.json(receipt);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/items/:itemId',
  authenticate,
  requireHousehold,
  validate(updateReceiptItemSchema),
  async (req, res, next) => {
    try {
      const receipt = await receiptService.updateReceiptItem({
        itemId: req.params.itemId,
        householdId: req.householdId!,
        data: req.body as UpdateReceiptItemInput,
      });
      res.json(receipt);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/confirm', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const receipt = await receiptService.confirmReceipt({
      receiptId: req.params.id,
      householdId: req.householdId!,
      userId: req.userId!,
    });
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/unlock', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const receipt = await receiptService.unlockReceipt({
      receiptId: req.params.id,
      householdId: req.householdId!,
    });
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/items/:itemId/tax-category',
  authenticate,
  requireHousehold,
  validate(setItemTaxCategorySchema),
  async (req, res, next) => {
    try {
      const { taxCategoryId, applyToChain, applyToReceipt } = req.body as {
        taxCategoryId: string | null;
        applyToChain: boolean;
        applyToReceipt: boolean;
      };
      const receipt = await receiptService.setItemTaxCategory({
        receiptItemId: req.params.itemId,
        taxCategoryId,
        applyToChain,
        applyToReceipt,
        householdId: req.householdId!,
      });
      res.json(receipt);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/items/:itemId/finance-category',
  authenticate,
  requireHousehold,
  validate(setItemFinanceCategorySchema),
  async (req, res, next) => {
    try {
      const { financeCategoryId, applyToReceipt } = req.body as {
        financeCategoryId: string | null;
        applyToReceipt: boolean;
      };
      const receipt = await receiptService.setItemFinanceCategory({
        receiptItemId: req.params.itemId,
        financeCategoryId,
        applyToReceipt,
        householdId: req.householdId!,
      });
      res.json(receipt);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
