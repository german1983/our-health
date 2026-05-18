import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  chains,
  chainTaxCodes,
  priceRecords,
  receiptItems,
  receipts,
  storeProductCodes,
  stores,
  taxCategories,
} from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { UpdateReceiptInput, UpdateReceiptItemInput } from '@personal-budget/shared';
import type {
  ReceiptItemResponse,
  ReceiptResponse,
  TaxCategoryResponse,
} from '@personal-budget/shared';
import { parseReceiptFromImage, parseReceiptFromText } from './parsers/index.js';

const receiptRelations = {
  chain: true,
  items: { with: { product: true, taxCategory: true } },
} as const;

type ReceiptWithItems = {
  id: string;
  chainId: string | null;
  chain: { id: string; key: string; name: string } | null;
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
  taxCode: string | null;
  taxCategoryId: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  taxRate: number | null;
  taxAmount: number | null;
  finalLineTotal: number | null;
  matched: boolean;
  productId: string | null;
  product: { name: string } | null;
  taxCategory: { name: string; rate: number } | null;
};

export interface CreateReceiptOptions {
  imageBase64: string;
  storeHint?: string;
  storeId?: string;
  currencyCode: string;
  householdId: string;
  userId: string;
}

async function resolveChainId(key: string | null | undefined): Promise<string | null> {
  if (!key || key === 'UNKNOWN') return null;
  const chain = await db.query.chains.findFirst({ where: eq(chains.key, key) });
  return chain?.id ?? null;
}

export async function createReceipt(opts: CreateReceiptOptions): Promise<ReceiptResponse> {
  if (opts.storeId) {
    const store = await db.query.stores.findFirst({
      where: and(eq(stores.id, opts.storeId), eq(stores.householdId, opts.householdId)),
    });
    if (!store) throw new NotFoundError('Store');
  }

  const dataUrl = opts.imageBase64.startsWith('data:')
    ? opts.imageBase64
    : `data:image/jpeg;base64,${opts.imageBase64}`;

  const { parsed, transcript } = await parseReceiptFromImage(dataUrl, opts.storeHint);
  const chainId = await resolveChainId(parsed.store);

  const matchedItems = await Promise.all(
    parsed.items.map(async (item) => {
      let productId: string | null = null;
      if (item.rawCode && opts.storeId) {
        const mapping = await db.query.storeProductCodes.findFirst({
          where: and(eq(storeProductCodes.storeId, opts.storeId), eq(storeProductCodes.code, item.rawCode)),
        });
        productId = mapping?.productId ?? null;
      }
      let taxCategoryId: string | null = null;
      if (item.taxCode && chainId) {
        const taxMapping = await db.query.chainTaxCodes.findFirst({
          where: and(eq(chainTaxCodes.chainId, chainId), eq(chainTaxCodes.code, item.taxCode)),
        });
        taxCategoryId = taxMapping?.taxCategoryId ?? null;
      }
      return {
        rawName: item.rawName,
        rawCode: item.rawCode ?? null,
        taxCode: item.taxCode ?? null,
        taxCategoryId,
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
        chainId,
        parserVersion: parsed.parserVersion,
        rawText: transcript,
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

  const parsed = await parseReceiptFromText(existing.rawText, opts.storeHint);
  const chainId = await resolveChainId(parsed.store);

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
      let taxCategoryId: string | null = null;
      if (item.taxCode && chainId) {
        const taxMapping = await db.query.chainTaxCodes.findFirst({
          where: and(eq(chainTaxCodes.chainId, chainId), eq(chainTaxCodes.code, item.taxCode)),
        });
        taxCategoryId = taxMapping?.taxCategoryId ?? null;
      }
      return {
        rawName: item.rawName,
        rawCode: item.rawCode ?? null,
        taxCode: item.taxCode ?? null,
        taxCategoryId,
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
        chainId,
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
    taxCode: item.taxCode,
    taxCategoryId: item.taxCategoryId,
    taxCategoryName: item.taxCategory?.name ?? null,
    taxCategoryRate: item.taxCategory?.rate ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    taxRate: item.taxRate,
    taxAmount: item.taxAmount,
    finalLineTotal: item.finalLineTotal,
    matched: item.matched,
    productId: item.productId,
    productName: item.product?.name ?? null,
  };
}

// ==================== Editing & Confirmation ====================

function ensureEditable(status: string): void {
  if (status === 'REVIEWED') {
    throw new ConflictError('Receipt is confirmed and locked. Unlock it to edit.');
  }
}

export async function updateReceiptHeader(args: {
  receiptId: string;
  householdId: string;
  data: UpdateReceiptInput;
}): Promise<ReceiptResponse> {
  const existing = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, args.receiptId), eq(receipts.householdId, args.householdId)),
  });
  if (!existing) throw new NotFoundError('Receipt');
  ensureEditable(existing.status);

  if (args.data.storeId) {
    const store = await db.query.stores.findFirst({
      where: and(eq(stores.id, args.data.storeId), eq(stores.householdId, args.householdId)),
    });
    if (!store) throw new NotFoundError('Store');
  }

  const updates: Record<string, unknown> = { ...args.data };
  if (args.data.purchasedAt !== undefined) {
    updates.purchasedAt = args.data.purchasedAt ? new Date(args.data.purchasedAt) : null;
  }

  await db.update(receipts).set(updates).where(eq(receipts.id, args.receiptId));

  return getReceipt(args.receiptId, args.householdId);
}

export async function updateReceiptItem(args: {
  itemId: string;
  householdId: string;
  data: UpdateReceiptItemInput;
}): Promise<ReceiptResponse> {
  const item = await db.query.receiptItems.findFirst({
    where: eq(receiptItems.id, args.itemId),
    with: { receipt: true },
  });
  if (!item || item.receipt.householdId !== args.householdId) {
    throw new NotFoundError('Receipt item');
  }
  ensureEditable(item.receipt.status);

  await db.update(receiptItems).set(args.data).where(eq(receiptItems.id, args.itemId));

  return getReceipt(item.receiptId, args.householdId);
}

export async function confirmReceipt(args: {
  receiptId: string;
  householdId: string;
}): Promise<ReceiptResponse> {
  const receipt = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, args.receiptId), eq(receipts.householdId, args.householdId)),
    with: { items: { with: { taxCategory: true } } },
  });
  if (!receipt) throw new NotFoundError('Receipt');
  if (receipt.status === 'REVIEWED') {
    throw new ConflictError('Receipt is already confirmed');
  }

  // Distribute the receipt's printed tax across taxed items proportionally
  // to lineTotal × rate. Snapshot the rate + dollar amount + final price
  // onto each row so the ledger entry doesn't drift when categories evolve.
  const weighted = receipt.items.reduce((sum, i) => {
    const rate = i.taxCategory?.rate ?? 0;
    return sum + i.lineTotal * rate;
  }, 0);
  const printedTax = receipt.tax ?? 0;

  await db.transaction(async (tx) => {
    for (const item of receipt.items) {
      const rate = item.taxCategory?.rate ?? 0;
      const weight = item.lineTotal * rate;
      const taxAmount = weighted > 0 ? (printedTax * weight) / weighted : 0;
      const finalLineTotal = item.lineTotal + taxAmount;
      await tx
        .update(receiptItems)
        .set({
          taxRate: rate,
          taxAmount,
          finalLineTotal,
        })
        .where(eq(receiptItems.id, item.id));
    }
    await tx
      .update(receipts)
      .set({ status: 'REVIEWED' })
      .where(eq(receipts.id, args.receiptId));
  });

  return getReceipt(args.receiptId, args.householdId);
}

export async function unlockReceipt(args: {
  receiptId: string;
  householdId: string;
}): Promise<ReceiptResponse> {
  const receipt = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, args.receiptId), eq(receipts.householdId, args.householdId)),
  });
  if (!receipt) throw new NotFoundError('Receipt');
  if (receipt.status !== 'REVIEWED') {
    return getReceipt(args.receiptId, args.householdId);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(receiptItems)
      .set({ taxRate: null, taxAmount: null, finalLineTotal: null })
      .where(eq(receiptItems.receiptId, args.receiptId));
    await tx
      .update(receipts)
      .set({ status: 'PARSED' })
      .where(eq(receipts.id, args.receiptId));
  });

  return getReceipt(args.receiptId, args.householdId);
}

// ==================== Tax Categories ====================

export async function listTaxCategories(): Promise<TaxCategoryResponse[]> {
  const rows = await db.query.taxCategories.findMany({
    orderBy: [asc(taxCategories.rate), asc(taxCategories.name)],
  });
  return rows.map((c) => ({ id: c.id, name: c.name, rate: c.rate }));
}

export interface SetItemTaxCategoryArgs {
  receiptItemId: string;
  taxCategoryId: string | null;
  applyToChain: boolean;
  applyToReceipt: boolean;
  householdId: string;
}

export async function setItemTaxCategory(args: SetItemTaxCategoryArgs): Promise<ReceiptResponse> {
  const item = await db.query.receiptItems.findFirst({
    where: eq(receiptItems.id, args.receiptItemId),
    with: { receipt: true },
  });
  if (!item || item.receipt.householdId !== args.householdId) {
    throw new NotFoundError('Receipt item');
  }
  ensureEditable(item.receipt.status);

  if (args.taxCategoryId) {
    const cat = await db.query.taxCategories.findFirst({
      where: eq(taxCategories.id, args.taxCategoryId),
    });
    if (!cat) throw new NotFoundError('Tax category');
  }

  await db.transaction(async (tx) => {
    // Always update the receipt item itself.
    await tx
      .update(receiptItems)
      .set({ taxCategoryId: args.taxCategoryId })
      .where(eq(receiptItems.id, item.id));

    // Optionally cascade to siblings in the same receipt that share the
    // same taxCode (so "fix Walmart J once" updates all six CDMTWIRL rows).
    if (args.applyToReceipt && item.taxCode) {
      await tx
        .update(receiptItems)
        .set({ taxCategoryId: args.taxCategoryId })
        .where(
          and(
            eq(receiptItems.receiptId, item.receiptId),
            eq(receiptItems.taxCode, item.taxCode),
          ),
        );
    }

    // Optionally persist the mapping so future receipts from this chain
    // pick up the corrected category automatically. Requires the receipt
    // to be linked to a known chain (chainId resolved at parse time).
    if (
      args.applyToChain &&
      item.taxCode &&
      args.taxCategoryId &&
      item.receipt.chainId
    ) {
      await tx
        .insert(chainTaxCodes)
        .values({
          chainId: item.receipt.chainId,
          code: item.taxCode,
          taxCategoryId: args.taxCategoryId,
        })
        .onConflictDoUpdate({
          target: [chainTaxCodes.chainId, chainTaxCodes.code],
          set: { taxCategoryId: args.taxCategoryId },
        });
    }
  });

  return getReceipt(item.receiptId, args.householdId);
}

function formatReceipt(receipt: ReceiptWithItems): ReceiptResponse {
  return {
    id: receipt.id,
    chainId: receipt.chainId,
    chainKey: receipt.chain?.key ?? null,
    chainName: receipt.chain?.name ?? null,
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
