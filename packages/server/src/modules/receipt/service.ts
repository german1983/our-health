import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type { ReceiptItemResponse, ReceiptResponse } from '@personal-budget/shared';
import { extractText, preprocessReceipt } from './ocr.js';
import { parseReceipt } from './parsers/index.js';

const receiptItemWithProduct = Prisma.validator<Prisma.ReceiptItemDefaultArgs>()({
  include: { product: true },
});
type ReceiptItemWithProduct = Prisma.ReceiptItemGetPayload<typeof receiptItemWithProduct>;

const receiptWithItems = Prisma.validator<Prisma.ReceiptDefaultArgs>()({
  include: { items: { include: { product: true } } },
});
type ReceiptWithItems = Prisma.ReceiptGetPayload<typeof receiptWithItems>;

export interface UploadReceiptOptions {
  buffer: Buffer;
  mimetype: string;
  storeHint?: string;
  storeId?: string;
  currencyCode: string;
  householdId: string;
  userId: string;
}

export async function uploadReceipt(opts: UploadReceiptOptions): Promise<ReceiptResponse> {
  if (!opts.mimetype.startsWith('image/')) {
    throw new ValidationError('File must be an image');
  }

  if (opts.storeId) {
    const store = await prisma.store.findFirst({
      where: { id: opts.storeId, householdId: opts.householdId },
    });
    if (!store) throw new NotFoundError('Store');
  }

  const processed = await preprocessReceipt(opts.buffer);
  const rawText = await extractText(processed);
  const parsed = parseReceipt(rawText, opts.storeHint);

  const itemsToCreate = await Promise.all(
    parsed.items.map(async (item) => {
      let productId: string | null = null;
      if (item.rawCode && opts.storeId) {
        const mapping = await prisma.storeProductCode.findUnique({
          where: { storeId_code: { storeId: opts.storeId, code: item.rawCode } },
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

  const receipt = await prisma.receipt.create({
    data: {
      householdId: opts.householdId,
      uploadedById: opts.userId,
      storeId: opts.storeId,
      store: parsed.store,
      parserVersion: parsed.parserVersion,
      rawText,
      parsedData: parsed as unknown as Prisma.InputJsonValue,
      status,
      purchasedAt: parsed.purchasedAt ?? null,
      subtotal: parsed.subtotal ?? null,
      tax: parsed.tax ?? null,
      total: parsed.total ?? null,
      currencyCode: opts.currencyCode,
      items: { create: itemsToCreate },
    },
    ...receiptWithItems,
  });

  if (opts.storeId) {
    const priceRecords = receipt.items
      .filter((i) => i.productId && i.unitPrice != null)
      .map((i) => ({
        productId: i.productId as string,
        storeId: opts.storeId as string,
        price: i.unitPrice as number,
        currencyCode: opts.currencyCode,
        recordedById: opts.userId,
      }));
    if (priceRecords.length > 0) {
      await prisma.priceRecord.createMany({ data: priceRecords });
    }
  }

  return formatReceipt(receipt);
}

export async function getReceipt(id: string, householdId: string): Promise<ReceiptResponse> {
  const receipt = await prisma.receipt.findFirst({
    where: { id, householdId },
    ...receiptWithItems,
  });
  if (!receipt) throw new NotFoundError('Receipt');
  return formatReceipt(receipt);
}

export async function listReceipts(householdId: string): Promise<ReceiptResponse[]> {
  const receipts = await prisma.receipt.findMany({
    where: { householdId },
    ...receiptWithItems,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return receipts.map(formatReceipt);
}

export async function getReceiptRawText(id: string, householdId: string): Promise<string> {
  const receipt = await prisma.receipt.findFirst({
    where: { id, householdId },
    select: { rawText: true },
  });
  if (!receipt) throw new NotFoundError('Receipt');
  return receipt.rawText;
}

export interface ReparseOptions {
  receiptId: string;
  householdId: string;
  storeHint?: string;
}

export async function reparseReceipt(opts: ReparseOptions): Promise<ReceiptResponse> {
  const existing = await prisma.receipt.findFirst({
    where: { id: opts.receiptId, householdId: opts.householdId },
  });
  if (!existing) throw new NotFoundError('Receipt');

  const parsed = parseReceipt(existing.rawText, opts.storeHint);

  const itemsToCreate = await Promise.all(
    parsed.items.map(async (item) => {
      let productId: string | null = null;
      if (item.rawCode && existing.storeId) {
        const mapping = await prisma.storeProductCode.findUnique({
          where: { storeId_code: { storeId: existing.storeId, code: item.rawCode } },
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

  // Reparse is a tuning operation: we replace items and parsed metadata
  // but leave any PriceRecord rows created on the original upload alone.
  // Recording prices for newly-matched lines happens through /confirm.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.receiptItem.deleteMany({ where: { receiptId: existing.id } });
    return tx.receipt.update({
      where: { id: existing.id },
      data: {
        store: parsed.store,
        parserVersion: parsed.parserVersion,
        parsedData: parsed as unknown as Prisma.InputJsonValue,
        status,
        purchasedAt: parsed.purchasedAt ?? null,
        subtotal: parsed.subtotal ?? null,
        tax: parsed.tax ?? null,
        total: parsed.total ?? null,
        items: { create: itemsToCreate },
      },
      ...receiptWithItems,
    });
  });

  return formatReceipt(updated);
}

export interface ConfirmItemArgs {
  receiptItemId: string;
  productId: string;
  saveStoreCode: boolean;
  householdId: string;
  userId: string;
}

export async function confirmReceiptItem(args: ConfirmItemArgs): Promise<ReceiptItemResponse> {
  const item = await prisma.receiptItem.findFirst({
    where: { id: args.receiptItemId, receipt: { householdId: args.householdId } },
    include: { receipt: true },
  });
  if (!item) throw new NotFoundError('Receipt item');

  await prisma.receiptItem.update({
    where: { id: item.id },
    data: { productId: args.productId, matched: true },
  });

  if (args.saveStoreCode && item.rawCode && item.receipt.storeId) {
    await prisma.storeProductCode.upsert({
      where: { storeId_code: { storeId: item.receipt.storeId, code: item.rawCode } },
      create: {
        storeId: item.receipt.storeId,
        code: item.rawCode,
        productId: args.productId,
      },
      update: { productId: args.productId },
    });
  }

  if (item.unitPrice != null && item.receipt.storeId) {
    await prisma.priceRecord.create({
      data: {
        productId: args.productId,
        storeId: item.receipt.storeId,
        price: item.unitPrice,
        currencyCode: item.receipt.currencyCode,
        recordedById: args.userId,
      },
    });
  }

  const updated = await prisma.receiptItem.findUniqueOrThrow({
    where: { id: item.id },
    ...receiptItemWithProduct,
  });
  return formatItem(updated);
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
