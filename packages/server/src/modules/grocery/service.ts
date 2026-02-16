import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { fetchProductByBarcode } from '../../integrations/open-food-facts.js';
import type {
  CreateProductInput,
  CreateStoreInput,
  UpdateStoreInput,
  CreatePriceRecordInput,
  BrandResponse,
  ProductResponse,
  StoreResponse,
  PriceRecordResponse,
} from '@personal-budget/shared';

// ==================== Products ====================

export async function lookupByBarcode(barcode: string): Promise<ProductResponse> {
  // Check local DB first
  const existing = await prisma.product.findUnique({ where: { barcode } });
  if (existing) {
    return formatProduct(existing);
  }

  // Fetch from Open Food Facts
  const offData = await fetchProductByBarcode(barcode);
  if (!offData) {
    throw new NotFoundError('Product not found for this barcode');
  }

  let brandId: string | undefined;
  if (offData.brand) {
    const brand = await prisma.brand.upsert({
      where: { name: offData.brand },
      create: { name: offData.brand },
      update: {},
    });
    brandId = brand.id;
  }

  const product = await prisma.product.create({
    data: {
      barcode,
      name: offData.name,
      brand: offData.brand,
      brandId,
      imageUrl: offData.imageUrl,
      nutritionalFacts: offData.nutritionalFacts ?? undefined,
      offRawData: offData.rawData as object,
    },
  });

  return formatProduct(product);
}

export async function searchProducts(query?: string, page = 1, limit = 20) {
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { brand: { contains: query, mode: 'insensitive' as const } },
          { barcode: { contains: query } },
        ],
      }
    : {};

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: products.map(formatProduct),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createProduct(input: CreateProductInput): Promise<ProductResponse> {
  let brandId: string | undefined;
  if (input.brand) {
    const brand = await prisma.brand.upsert({
      where: { name: input.brand },
      create: { name: input.brand },
      update: {},
    });
    brandId = brand.id;
  }

  const product = await prisma.product.create({
    data: {
      barcode: input.barcode,
      name: input.name,
      brand: input.brand,
      brandId,
      imageUrl: input.imageUrl,
      nutritionalFacts: input.nutritionalFacts ?? undefined,
      nutritionBaseGrams: input.nutritionBaseGrams ?? 100,
    },
  });
  return formatProduct(product);
}

// ==================== Brands ====================

export async function searchBrands(query: string): Promise<BrandResponse[]> {
  const brands = await prisma.brand.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    take: 20,
  });
  return brands.map((b) => ({ id: b.id, name: b.name }));
}

// ==================== Stores ====================

export async function getStores(householdId: string): Promise<StoreResponse[]> {
  const stores = await prisma.store.findMany({
    where: { householdId },
    orderBy: { name: 'asc' },
  });
  return stores.map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function createStore(input: CreateStoreInput, householdId: string): Promise<StoreResponse> {
  const store = await prisma.store.create({
    data: {
      householdId,
      name: input.name,
      location: input.location,
    },
  });
  return {
    id: store.id,
    name: store.name,
    location: store.location,
    createdAt: store.createdAt.toISOString(),
  };
}

export async function updateStore(id: string, input: UpdateStoreInput, householdId: string): Promise<StoreResponse> {
  const store = await prisma.store.update({
    where: { id, householdId },
    data: input,
  });
  return {
    id: store.id,
    name: store.name,
    location: store.location,
    createdAt: store.createdAt.toISOString(),
  };
}

export async function deleteStore(id: string, householdId: string): Promise<void> {
  await prisma.store.delete({ where: { id, householdId } });
}

// ==================== Price Records ====================

export async function recordPrice(input: CreatePriceRecordInput, userId: string): Promise<PriceRecordResponse> {
  const record = await prisma.priceRecord.create({
    data: {
      productId: input.productId,
      storeId: input.storeId,
      price: input.price,
      currencyCode: input.currencyCode,
      recordedById: userId,
    },
    include: { store: true },
  });

  return {
    id: record.id,
    productId: record.productId,
    storeId: record.storeId,
    storeName: record.store.name,
    price: record.price,
    currencyCode: record.currencyCode,
    recordedAt: record.recordedAt.toISOString(),
    recordedBy: record.recordedById,
  };
}

export async function getPriceHistory(
  productId: string,
  options: { storeId?: string; limit?: number },
): Promise<PriceRecordResponse[]> {
  const where: Record<string, unknown> = { productId };
  if (options.storeId) where.storeId = options.storeId;

  const records = await prisma.priceRecord.findMany({
    where,
    include: { store: true },
    orderBy: { recordedAt: 'desc' },
    take: options.limit || 50,
  });

  return records.map((r) => ({
    id: r.id,
    productId: r.productId,
    storeId: r.storeId,
    storeName: r.store.name,
    price: r.price,
    currencyCode: r.currencyCode,
    recordedAt: r.recordedAt.toISOString(),
    recordedBy: r.recordedById,
  }));
}

export async function comparePrices(productId: string): Promise<PriceRecordResponse[]> {
  // Get the latest price per store for a product
  const stores = await prisma.store.findMany({
    where: {
      priceRecords: {
        some: { productId },
      },
    },
  });

  const latestPrices: PriceRecordResponse[] = [];
  for (const store of stores) {
    const latest = await prisma.priceRecord.findFirst({
      where: { productId, storeId: store.id },
      orderBy: { recordedAt: 'desc' },
      include: { store: true },
    });
    if (latest) {
      latestPrices.push({
        id: latest.id,
        productId: latest.productId,
        storeId: latest.storeId,
        storeName: latest.store.name,
        price: latest.price,
        currencyCode: latest.currencyCode,
        recordedAt: latest.recordedAt.toISOString(),
        recordedBy: latest.recordedById,
      });
    }
  }

  return latestPrices.sort((a, b) => a.price - b.price);
}

// ==================== Helpers ====================

function formatProduct(p: {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  nutritionalFacts: unknown;
  nutritionBaseGrams: number;
  createdAt: Date;
}): ProductResponse {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    imageUrl: p.imageUrl,
    nutritionalFacts: p.nutritionalFacts as ProductResponse['nutritionalFacts'],
    nutritionBaseGrams: p.nutritionBaseGrams,
    createdAt: p.createdAt.toISOString(),
  };
}
