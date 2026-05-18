import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  priceRecords,
  receiptItems,
  receipts,
  storeProductCodes,
  stores,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { ReceiptItemResponse, ReceiptResponse } from '@personal-budget/shared';
import { parseReceipt } from './parsers/index.js';

const receiptRelations = {
  items: { with: { product: true } },
} as const;

type ReceiptWithItems = {
  id: string;
  store: string;
  storeId: string | null;
  status: 'PENDING' | 'PARSED' | 'REVIEWED' | 'FAILED';
  purchasedAt: Date | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currencyCode: string;
  parserVersion: string | null;
  createdAt: Date;
  items: ReceiptItemWithProduct[];
};

type ReceiptItemWithProduct = {
  id: string;
  rawName: string;
  rawCode: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  matched: boolean;
  productId: string | null;
  product: { name: string } | null;
};

export interface CreateReceiptOptions {
  rawText: string;
  storeHint?: string;
  storeId?: string;
  currencyCode: string;
  householdId: string;
  userId: string;
}

export async function createReceipt(opts: CreateReceiptOptions): Promise<ReceiptResponse> {
  if (opts.storeId) {
    const store = await db.query.stores.findFirst({
      where: and(eq(stores.id, opts.storeId), eq(stores.householdId, opts.householdId)),
    });
    if (!store) throw new NotFoundError('Store');
  }

  const parsed = await parseReceipt(opts.rawText, opts.storeHint);

  const matchedItems = await Promise.all(
    parsed.items.map(async (item) => {
      let productId: string | null = null;
      if (item.rawCode && opts.storeId) {
        const mapping = await db.query.storeProductCodes.findFirst({
          where: and(eq(storeProductCodes.storeId, opts.storeId), eq(storeProductCodes.code, item.rawCode)),
        });
        productId = mapping?.productId ?? null;
      }
      return {
        rawName: item.rawName,
        rawCode: item.rawCode ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? null,
        lineTotal: item.lineTotal,
        matched: !!productId,
        productId,
      };
    }),
  );

  const status = parsed.items.length === 0 ? 'FAILED' : 'PARSED';

  const receiptId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(receipts)
      .values({
        householdId: opts.householdId,
        uploadedById: opts.userId,
        storeId: opts.storeId,
        store: parsed.store,
        parserVersion: parsed.parserVersion,
        rawText: opts.rawText,
        parsedData: parsed,
        status,
        purchasedAt: parsed.purchasedAt ?? null,
        subtotal: parsed.subtotal ?? null,
        tax: parsed.tax ?? null,
        total: parsed.total ?? null,
        currencyCode: opts.currencyCode,
      })
      .returning({ id: receipts.id });

    if (matchedItems.length > 0) {
      await tx
        .insert(receiptItems)
        .values(matchedItems.map((i) => ({ ...i, receiptId: created.id })));
    }

    if (opts.storeId) {
      const toRecord = matchedItems.filter((i) => i.productId && i.unitPrice != null);
      if (toRecord.length > 0) {
        await tx.insert(priceRecords).values(
          toRecord.map((i) => ({
            productId: i.productId as string,
            storeId: opts.storeId as string,
            price: i.unitPrice as number,
            currencyCode: opts.currencyCode,
            recordedById: opts.userId,
          })),
        );
      }
    }

    return created.id;
  });

  return getReceipt(receiptId, opts.householdId);
}

export async function getReceipt(id: string, householdId: string): Promise<ReceiptResponse> {
  const receipt = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, id), eq(receipts.householdId, householdId)),
    with: receiptRelations,
  });
  if (!receipt) throw new NotFoundError('Receipt');
  return formatReceipt(receipt as unknown as ReceiptWithItems);
}

export async function listReceipts(householdId: string): Promise<ReceiptResponse[]> {
  const rows = await db.query.receipts.findMany({
    where: eq(receipts.householdId, householdId),
    with: receiptRelations,
    orderBy: desc(receipts.createdAt),
    limit: 50,
  });
  return rows.map((r) => formatReceipt(r as unknown as ReceiptWithItems));
}

export async function getReceiptRawText(id: string, householdId: string): Promise<string> {
  const receipt = await db
    .select({ rawText: receipts.rawText })
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.householdId, householdId)))
    .limit(1);
  if (receipt.length === 0) throw new NotFoundError('Receipt');
  return receipt[0].rawText;
}

export interface ReparseOptions {
  receiptId: string;
  householdId: string;
  storeHint?: string;
}

export async function reparseReceipt(opts: ReparseOptions): Promise<ReceiptResponse> {
  const existing = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, opts.receiptId), eq(receipts.householdId, opts.householdId)),
  });
  if (!existing) throw new NotFoundError('Receipt');

  const parsed = await parseReceipt(existing.rawText, opts.storeHint);

  const matchedItems = await Promise.all(
    parsed.items.map(async (item) => {
      let productId: string | null = null;
      if (item.rawCode && existing.storeId) {
        const mapping = await db.query.storeProductCodes.findFirst({
          where: and(
            eq(storeProductCodes.storeId, existing.storeId),
            eq(storeProductCodes.code, item.rawCode),
          ),
        });
        productId = mapping?.productId ?? null;
      }
      return {
        rawName: item.rawName,
        rawCode: item.rawCode ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? null,
        lineTotal: item.lineTotal,
        matched: !!productId,
        productId,
      };
    }),
  );

  const status = parsed.items.length === 0 ? 'FAILED' : 'PARSED';

  // Reparse is a tuning operation: items + parsed metadata are replaced,
  // but PriceRecord rows created on the original upload stay intact.
  await db.transaction(async (tx) => {
    await tx.delete(receiptItems).where(eq(receiptItems.receiptId, existing.id));
    await tx
      .update(receipts)
      .set({
        store: parsed.store,
        parserVersion: parsed.parserVersion,
        parsedData: parsed,
        status,
        purchasedAt: parsed.purchasedAt ?? null,
        subtotal: parsed.subtotal ?? null,
        tax: parsed.tax ?? null,
        total: parsed.total ?? null,
      })
      .where(eq(receipts.id, existing.id));
    if (matchedItems.length > 0) {
      await tx
        .insert(receiptItems)
        .values(matchedItems.map((i) => ({ ...i, receiptId: existing.id })));
    }
  });

  return getReceipt(existing.id, opts.householdId);
}

export interface ConfirmItemArgs {
  receiptItemId: string;
  productId: string;
  saveStoreCode: boolean;
  householdId: string;
  userId: string;
}

export async function confirmReceiptItem(args: ConfirmItemArgs): Promise<ReceiptItemResponse> {
  const item = await db.query.receiptItems.findFirst({
    where: eq(receiptItems.id, args.receiptItemId),
    with: { receipt: true },
  });
  if (!item || item.receipt.householdId !== args.householdId) {
    throw new NotFoundError('Receipt item');
  }

  await db
    .update(receiptItems)
    .set({ productId: args.productId, matched: true })
    .where(eq(receiptItems.id, item.id));

  if (args.saveStoreCode && item.rawCode && item.receipt.storeId) {
    await db
      .insert(storeProductCodes)
      .values({
        storeId: item.receipt.storeId,
        code: item.rawCode,
        productId: args.productId,
      })
      .onConflictDoUpdate({
        target: [storeProductCodes.storeId, storeProductCodes.code],
        set: { productId: args.productId },
      });
  }

  if (item.unitPrice != null && item.receipt.storeId) {
    await db.insert(priceRecords).values({
      productId: args.productId,
      storeId: item.receipt.storeId,
      price: item.unitPrice,
      currencyCode: item.receipt.currencyCode,
      recordedById: args.userId,
    });
  }

  const updated = await db.query.receiptItems.findFirst({
    where: eq(receiptItems.id, item.id),
    with: { product: true },
  });
  return formatItem(updated as unknown as ReceiptItemWithProduct);
}

function formatItem(item: ReceiptItemWithProduct): ReceiptItemResponse {
  return {
    id: item.id,
    rawName: item.rawName,
    rawCode: item.rawCode,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    matched: item.matched,
    productId: item.productId,
    productName: item.product?.name ?? null,
  };
}

function formatReceipt(receipt: ReceiptWithItems): ReceiptResponse {
  return {
    id: receipt.id,
    store: receipt.store,
    storeId: receipt.storeId,
    status: receipt.status,
    purchasedAt: receipt.purchasedAt?.toISOString() ?? null,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    total: receipt.total,
    currencyCode: receipt.currencyCode,
    parserVersion: receipt.parserVersion,
    items: receipt.items.map(formatItem),
    createdAt: receipt.createdAt.toISOString(),
  };
}
