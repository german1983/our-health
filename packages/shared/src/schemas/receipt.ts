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

export interface ReceiptItemResponse {
  id: string;
  rawName: string;
  rawCode: string | null;
  taxCode: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
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
