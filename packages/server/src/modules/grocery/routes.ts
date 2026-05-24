import { Router } from 'express';
import {
  createProductSchema,
  updateProductSchema,
  createProductPresentationSchema,
  updateProductPresentationSchema,
  createStoreSchema,
  updateStoreSchema,
  createPriceRecordSchema,
  productSearchSchema,
} from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as groceryService from './service.js';

const router = Router();

// Products (global, no household required for search/lookup)
router.get('/products/barcode/:code', authenticate, async (req, res, next) => {
  try {
    const product = await groceryService.lookupByBarcode(req.params.code);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.get('/products', authenticate, validate(productSearchSchema, 'query'), async (req, res, next) => {
  try {
    const { query, page, limit } = req.query as unknown as { query?: string; page: number; limit: number };
    const result = await groceryService.searchProducts(query, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/products', authenticate, validate(createProductSchema), async (req, res, next) => {
  try {
    const product = await groceryService.createProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

router.get('/products/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const detail = await groceryService.getProductDetail(req.params.id, req.householdId!);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/products/:id',
  authenticate,
  requireHousehold,
  validate(updateProductSchema),
  async (req, res, next) => {
    try {
      const product = await groceryService.updateProduct(req.params.id, req.body);
      res.json(product);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/products/:id/presentations',
  authenticate,
  requireHousehold,
  validate(createProductPresentationSchema),
  async (req, res, next) => {
    try {
      const presentation = await groceryService.addProductPresentation(req.params.id, req.body);
      res.status(201).json(presentation);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/products/presentations/:id',
  authenticate,
  requireHousehold,
  validate(updateProductPresentationSchema),
  async (req, res, next) => {
    try {
      const presentation = await groceryService.updateProductPresentation(req.params.id, req.body);
      res.json(presentation);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/products/presentations/:id',
  authenticate,
  requireHousehold,
  async (req, res, next) => {
    try {
      await groceryService.deleteProductPresentation(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// Brands
router.get('/brands', authenticate, async (req, res, next) => {
  try {
    const query = (req.query.query as string) || '';
    const brands = await groceryService.searchBrands(query);
    res.json(brands);
  } catch (err) {
    next(err);
  }
});

// Stores (household-scoped)
router.get('/stores', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const stores = await groceryService.getStores(req.householdId!);
    res.json(stores);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/stores',
  authenticate,
  requireHousehold,
  validate(createStoreSchema),
  async (req, res, next) => {
    try {
      const store = await groceryService.createStore(req.body, req.householdId!);
      res.status(201).json(store);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/stores/:id',
  authenticate,
  requireHousehold,
  validate(updateStoreSchema),
  async (req, res, next) => {
    try {
      const store = await groceryService.updateStore(req.params.id, req.body, req.householdId!);
      res.json(store);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/stores/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await groceryService.deleteStore(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Prices
router.post(
  '/prices',
  authenticate,
  requireHousehold,
  validate(createPriceRecordSchema),
  async (req, res, next) => {
    try {
      const record = await groceryService.recordPrice(req.body, req.userId!);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/prices/product/:id', authenticate, async (req, res, next) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const records = await groceryService.getPriceHistory(req.params.id, { storeId, limit });
    res.json(records);
  } catch (err) {
    next(err);
  }
});

router.get('/prices/compare/:id', authenticate, async (req, res, next) => {
  try {
    const records = await groceryService.comparePrices(req.params.id);
    res.json(records);
  } catch (err) {
    next(err);
  }
});

export default router;
