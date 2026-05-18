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

export const confirmReceiptItemSchema = z.object({
  productId: z.string().uuid(),
  saveStoreCode: z.boolean().default(true),
});
export type ConfirmReceiptItemInput = z.infer<typeof confirmReceiptItemSchema>;

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
  })
  .strict();
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;

export const updateReceiptItemSchema = z
  .object({
    rawName: z.string().min(1).optional(),
    quantity: z.number().optional(),
    unitPrice: z.number().nullable().optional(),
    lineTotal: z.number().optional(),
  })
  .strict();
export type UpdateReceiptItemInput = z.infer<typeof updateReceiptItemSchema>;

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
}

export interface ReceiptResponse {
  id: string;
  store: string;
  storeId: string | null;
  status: ReceiptStatus;
  purchasedAt: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currencyCode: string;
  parserVersion: string | null;
  items: ReceiptItemResponse[];
  createdAt: string;
}
