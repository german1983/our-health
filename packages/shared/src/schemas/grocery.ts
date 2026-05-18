import { z } from 'zod';

export const nutritionalFactsSchema = z.object({
  calories: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  saturatedFat: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  sugars: z.number().min(0).optional(),
  fiber: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  salt: z.number().min(0).optional(),
});

export const createProductSchema = z.object({
  barcode: z.string().optional(),
  name: z.string().min(1, 'Product name is required').max(200),
  brand: z.string().max(200).optional(),
  imageUrl: z.string().url().optional(),
  nutritionalFacts: nutritionalFactsSchema.optional(),
  nutritionBaseGrams: z.number().positive().optional(),
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
  nutritionalFacts: NutritionalFacts | null;
  nutritionBaseGrams: number;
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
