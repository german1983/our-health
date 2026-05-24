import { z } from 'zod';

export const receiptStatusEnum = z.enum(['PENDING', 'PARSED', 'REVIEWED', 'FAILED']);
export type ReceiptStatus = z.infer<typeof receiptStatusEnum>;

export const supportedReceiptStores = z.enum(['WALMART', 'LOBLAWS', 'FARM_BOY', 'UNKNOWN']);
export type SupportedReceiptStore = z.infer<typeof supportedReceiptStores>;

export const createReceiptSchema = z.object({
  imageBase64: z
    .string()
    .min(1, 'imageBase64 is required')
    .max(8_000_000, 'image too large'),
  storeId: z.string().uuid().optional(),
  storeHint: supportedReceiptStores.optional(),
  currencyCode: z.string().length(3).default('CAD'),
});
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

export const createManualReceiptSchema = z.object({
  purchasedAt: z.string().datetime().optional(),
  storeId: z.string().uuid().optional(),
  chainId: z.string().uuid().optional(),
  currencyCode: z.string().length(3).default('CAD'),
  paymentMethodId: z.string().uuid().optional(),
  defaultStorageSpaceId: z.string().uuid().optional(),
  defaultCategoryId: z.string().uuid().optional(),
  subtotal: z.number().nullable().optional(),
  tax: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  description: z.string().max(200).optional(),
});
export type CreateManualReceiptInput = z.infer<typeof createManualReceiptSchema>;

export const addReceiptItemSchema = z.object({
  productId: z.string().uuid(),
  presentationId: z.string().uuid().nullable().optional(),
  rawName: z.string().min(1).optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nullable().optional(),
  lineTotal: z.number(),
  taxCategoryId: z.string().uuid().nullable().optional(),
  financeCategoryId: z.string().uuid().nullable().optional(),
  storageSpaceId: z.string().uuid().nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
});
export type AddReceiptItemInput = z.infer<typeof addReceiptItemSchema>;

export const confirmReceiptItemSchema = z.object({
  productId: z.string().uuid(),
  saveStoreCode: z.boolean().default(true),
});
export type ConfirmReceiptItemInput = z.infer<typeof confirmReceiptItemSchema>;

export const matchReceiptItemSchema = z.object({
  productId: z.string().uuid().nullable(),
  /** Optional. When set, the match lands on this specific presentation
      instead of the product's default. */
  presentationId: z.string().uuid().nullable().optional(),
  saveChainCode: z.boolean().default(true),
  applyToReceipt: z.boolean().default(true),
});
export type MatchReceiptItemInput = z.infer<typeof matchReceiptItemSchema>;

export const setItemTaxCategorySchema = z.object({
  taxCategoryId: z.string().uuid().nullable(),
  applyToChain: z.boolean().default(true),
  applyToReceipt: z.boolean().default(true),
});
export type SetItemTaxCategoryInput = z.infer<typeof setItemTaxCategorySchema>;

export const updateReceiptSchema = z
  .object({
    subtotal: z.number().nullable().optional(),
    tax: z.number().nullable().optional(),
    total: z.number().nullable().optional(),
    purchasedAt: z.string().datetime().nullable().optional(),
    storeId: z.string().uuid().nullable().optional(),
    currencyCode: z.string().length(3).optional(),
    paymentMethodId: z.string().uuid().nullable().optional(),
    defaultCategoryId: z.string().uuid().nullable().optional(),
    defaultStorageSpaceId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;

export const updateReceiptItemSchema = z
  .object({
    rawName: z.string().min(1).optional(),
    quantity: z.number().optional(),
    unitPrice: z.number().nullable().optional(),
    lineTotal: z.number().optional(),
    financeCategoryId: z.string().uuid().nullable().optional(),
    storageSpaceId: z.string().uuid().nullable().optional(),
    expiryDate: z.string().datetime().nullable().optional(),
    presentationId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type UpdateReceiptItemInput = z.infer<typeof updateReceiptItemSchema>;

export const setItemFinanceCategorySchema = z.object({
  financeCategoryId: z.string().uuid().nullable(),
  /** Cascade to siblings on this receipt that share the same rawCode. */
  applyToReceipt: z.boolean().default(true),
});
export type SetItemFinanceCategoryInput = z.infer<typeof setItemFinanceCategorySchema>;

export const createReceiptAdjustmentSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().max(200).optional(),
});
export type CreateReceiptAdjustmentInput = z.infer<typeof createReceiptAdjustmentSchema>;

export const updateReceiptAdjustmentSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    amount: z.number().positive().optional(),
    description: z.string().max(200).nullable().optional(),
  })
  .strict();
export type UpdateReceiptAdjustmentInput = z.infer<typeof updateReceiptAdjustmentSchema>;

export interface ReceiptAdjustmentResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface TaxCategoryResponse {
  id: string;
  name: string;
  rate: number;
}

export interface ReceiptItemResponse {
  id: string;
  rawName: string;
  rawCode: string | null;
  taxCode: string | null;
  taxCategoryId: string | null;
  taxCategoryName: string | null;
  taxCategoryRate: number | null;
  financeCategoryId: string | null;
  financeCategoryName: string | null;
  storageSpaceId: string | null;
  storageSpaceName: string | null;
  /** Most-recently-used storage space for this product across the household, if any. */
  suggestedStorageSpaceId: string | null;
  suggestedStorageSpaceName: string | null;
  expiryDate: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  /** Snapshot of the category rate at receipt-confirmation time. */
  taxRate: number | null;
  /** Dollars of tax assigned to this line at confirmation. */
  taxAmount: number | null;
  /** Pre-tax line total + tax snapshot. */
  finalLineTotal: number | null;
  matched: boolean;
  productId: string | null;
  productName: string | null;
  /** Presentation chosen for this line (governs storage qty on confirm). */
  presentationId: string | null;
  presentationName: string | null;
  presentationAmount: number | null;
  presentationUnit: string | null;
}

export interface ReceiptResponse {
  id: string;
  chainId: string | null;
  chainKey: string | null;
  chainName: string | null;
  storeId: string | null;
  storeName: string | null;
  status: ReceiptStatus;
  purchasedAt: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currencyCode: string;
  parserVersion: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  defaultCategoryId: string | null;
  defaultCategoryName: string | null;
  defaultStorageSpaceId: string | null;
  defaultStorageSpaceName: string | null;
  items: ReceiptItemResponse[];
  adjustments: ReceiptAdjustmentResponse[];
  createdAt: string;
}
