import { z } from 'zod';
import { unitCodeSchema } from '../units.js';

export const nutritionalFactsSchema = z.object({
  calories: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  saturatedFat: z.number().min(0).optional(),
  transFat: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  sugars: z.number().min(0).optional(),
  fiber: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  sodium: z.number().min(0).optional(),
  potassium: z.number().min(0).optional(),
  calcium: z.number().min(0).optional(),
  iron: z.number().min(0).optional(),
  vitaminA: z.number().min(0).optional(),
  vitaminD: z.number().min(0).optional(),
  cholesterol: z.number().min(0).optional(),
});

export const createProductSchema = z.object({
  barcode: z.string().optional(),
  name: z.string().min(1, 'Product name is required').max(200),
  brand: z.string().max(200).optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  nutritionalFacts: nutritionalFactsSchema.optional(),
  nutritionBaseAmount: z.number().positive().optional(),
  nutritionBaseUnit: unitCodeSchema.optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(200).nullable().optional(),
  barcode: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  nutritionalFacts: nutritionalFactsSchema.nullable().optional(),
  nutritionBaseAmount: z.number().positive().optional(),
  nutritionBaseUnit: unitCodeSchema.optional(),
});

export const createStoreSchema = z.object({
  name: z.string().min(1, 'Store name is required').max(200),
  location: z.string().max(500).optional(),
  chainId: z.string().uuid().nullable().optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

export const createPriceRecordSchema = z.object({
  productId: z.string().uuid(),
  storeId: z.string().uuid(),
  price: z.number().positive('Price must be positive'),
  currencyCode: z.string().length(3),
});

export const createProductPresentationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  amount: z.number().positive('Amount must be positive'),
  unit: unitCodeSchema,
  isDefault: z.boolean().optional(),
});
export type CreateProductPresentationInput = z.infer<typeof createProductPresentationSchema>;

export const updateProductPresentationSchema = createProductPresentationSchema.partial();
export type UpdateProductPresentationInput = z.infer<typeof updateProductPresentationSchema>;

export const productSearchSchema = z.object({
  query: z.string().optional(),
  barcode: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const priceHistoryQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type NutritionalFacts = z.infer<typeof nutritionalFactsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type CreatePriceRecordInput = z.infer<typeof createPriceRecordSchema>;
export type ProductSearchInput = z.infer<typeof productSearchSchema>;

export interface BrandResponse {
  id: string;
  name: string;
}

export interface ProductResponse {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** Owning finance category, drives nutrition display gating. */
  categoryId: string | null;
  categoryName: string | null;
  /** Cached from the category — clients use this to decide whether to render facts. */
  categoryHasNutritionalFacts: boolean;
  nutritionalFacts: NutritionalFacts | null;
  nutritionBaseAmount: number;
  nutritionBaseUnit: string;
  createdAt: string;
}

export interface StoreResponse {
  id: string;
  name: string;
  location: string | null;
  chainId: string | null;
  chainKey: string | null;
  chainName: string | null;
  createdAt: string;
}

export interface PriceRecordResponse {
  id: string;
  productId: string;
  storeId: string;
  storeName: string;
  price: number;
  currencyCode: string;
  recordedAt: string;
  recordedBy: string;
}

export interface ProductStorageEntry {
  id: string;
  storageSpaceId: string;
  spaceName: string;
  spaceType: 'FRIDGE' | 'FREEZER' | 'PANTRY' | 'CABINET' | 'OTHER';
  quantity: number;
  unit: string;
  expiryDate: string | null;
  addedAt: string;
}

export interface ProductPurchaseEntry {
  receiptItemId: string;
  receiptId: string;
  purchasedAt: string | null;
  storeId: string | null;
  storeName: string | null;
  rawName: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  currencyCode: string;
}

export interface ProductPresentationResponse {
  id: string;
  productId: string;
  name: string;
  amount: number;
  unit: string;
  isDefault: boolean;
}

export interface ProductDetailResponse extends ProductResponse {
  storageEntries: ProductStorageEntry[];
  purchaseHistory: ProductPurchaseEntry[];
  presentations: ProductPresentationResponse[];
}
