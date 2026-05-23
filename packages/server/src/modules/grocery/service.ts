import { and, eq, ilike, or, asc, desc, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { brands, products, stores, priceRecords } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { fetchProductByBarcode } from '../../integrations/open-food-facts.js';
import type {
  CreateProductInput,
  CreateStoreInput,
  UpdateStoreInput,
  CreatePriceRecordInput,
  BrandResponse,
  NutritionalFacts,
  ProductResponse,
  StoreResponse,
  PriceRecordResponse,
} from '@personal-budget/shared';

// ==================== Products ====================

export async function lookupByBarcode(barcode: string): Promise<ProductResponse> {
  const existing = await db.query.products.findFirst({ where: eq(products.barcode, barcode) });
  if (existing) return formatProduct(existing);

  const offData = await fetchProductByBarcode(barcode);
  if (!offData) throw new NotFoundError('Product not found for this barcode');

  let brandId: string | undefined;
  if (offData.brand) {
    const [brand] = await db
      .insert(brands)
      .values({ name: offData.brand })
      .onConflictDoUpdate({ target: brands.name, set: { name: offData.brand } })
      .returning();
    brandId = brand.id;
  }

  const [product] = await db
    .insert(products)
    .values({
      barcode,
      name: offData.name,
      brand: offData.brand,
      brandId,
      imageUrl: offData.imageUrl,
      nutritionalFacts: (offData.nutritionalFacts ?? null) as NutritionalFacts | null,
      offRawData: offData.rawData,
    })
    .returning();

  return formatProduct(product);
}

export async function searchProducts(query?: string, page = 1, limit = 20) {
  const where = query
    ? or(
        ilike(products.name, `%${query}%`),
        ilike(products.brand, `%${query}%`),
        ilike(products.barcode, `%${query}%`),
      )
    : undefined;

  const [items, total] = await Promise.all([
    db.query.products.findMany({
      where,
      orderBy: asc(products.name),
      limit,
      offset: (page - 1) * limit,
    }),
    db.$count(products, where),
  ]);

  return {
    items: items.map(formatProduct),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createProduct(input: CreateProductInput): Promise<ProductResponse> {
  let brandId: string | undefined;
  if (input.brand) {
    const [brand] = await db
      .insert(brands)
      .values({ name: input.brand })
      .onConflictDoUpdate({ target: brands.name, set: { name: input.brand } })
      .returning();
    brandId = brand.id;
  }

  const [product] = await db
    .insert(products)
    .values({
      barcode: input.barcode,
      name: input.name,
      brand: input.brand,
      brandId,
      imageUrl: input.imageUrl,
      nutritionalFacts: (input.nutritionalFacts ?? null) as NutritionalFacts | null,
      nutritionBaseAmount: input.nutritionBaseAmount ?? 100,
      nutritionBaseUnit: input.nutritionBaseUnit ?? 'g',
    })
    .returning();

  return formatProduct(product);
}

// ==================== Brands ====================

export async function searchBrands(query: string): Promise<BrandResponse[]> {
  const result = await db.query.brands.findMany({
    where: ilike(brands.name, `%${query}%`),
    orderBy: asc(brands.name),
    limit: 20,
  });
  return result.map((b) => ({ id: b.id, name: b.name }));
}

// ==================== Stores ====================

type StoreWithChain = {
  id: string;
  name: string;
  location: string | null;
  chainId: string | null;
  createdAt: Date;
  chain: { key: string; name: string } | null;
};

function formatStore(s: StoreWithChain): StoreResponse {
  return {
    id: s.id,
    name: s.name,
    location: s.location,
    chainId: s.chainId,
    chainKey: s.chain?.key ?? null,
    chainName: s.chain?.name ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function getStores(householdId: string): Promise<StoreResponse[]> {
  const result = (await db.query.stores.findMany({
    where: eq(stores.householdId, householdId),
    with: { chain: true },
    orderBy: asc(stores.name),
  })) as unknown as StoreWithChain[];
  return result.map(formatStore);
}

export async function createStore(input: CreateStoreInput, householdId: string): Promise<StoreResponse> {
  const [inserted] = await db
    .insert(stores)
    .values({
      householdId,
      name: input.name,
      location: input.location,
      chainId: input.chainId ?? null,
    })
    .returning({ id: stores.id });

  const store = (await db.query.stores.findFirst({
    where: eq(stores.id, inserted.id),
    with: { chain: true },
  })) as unknown as StoreWithChain;
  return formatStore(store);
}

export async function updateStore(
  id: string,
  input: UpdateStoreInput,
  householdId: string,
): Promise<StoreResponse> {
  const [updated] = await db
    .update(stores)
    .set(input)
    .where(and(eq(stores.id, id), eq(stores.householdId, householdId)))
    .returning({ id: stores.id });
  if (!updated) throw new NotFoundError('Store');

  const store = (await db.query.stores.findFirst({
    where: eq(stores.id, updated.id),
    with: { chain: true },
  })) as unknown as StoreWithChain;
  return formatStore(store);
}

export async function deleteStore(id: string, householdId: string): Promise<void> {
  await db.delete(stores).where(and(eq(stores.id, id), eq(stores.householdId, householdId)));
}

// ==================== Price Records ====================

export async function recordPrice(input: CreatePriceRecordInput, userId: string): Promise<PriceRecordResponse> {
  const [record] = await db
    .insert(priceRecords)
    .values({
      productId: input.productId,
      storeId: input.storeId,
      price: input.price,
      currencyCode: input.currencyCode,
      recordedById: userId,
    })
    .returning();

  const store = await db.query.stores.findFirst({ where: eq(stores.id, record.storeId) });

  return {
    id: record.id,
    productId: record.productId,
    storeId: record.storeId,
    storeName: store!.name,
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
  const whereClause = options.storeId
    ? and(eq(priceRecords.productId, productId), eq(priceRecords.storeId, options.storeId))
    : eq(priceRecords.productId, productId);

  const records = await db.query.priceRecords.findMany({
    where: whereClause,
    with: { store: true },
    orderBy: desc(priceRecords.recordedAt),
    limit: options.limit ?? 50,
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
  // Latest price per store: DISTINCT ON ordering by store, then most-recent
  const latest = await db
    .selectDistinctOn([priceRecords.storeId], {
      id: priceRecords.id,
      productId: priceRecords.productId,
      storeId: priceRecords.storeId,
      price: priceRecords.price,
      currencyCode: priceRecords.currencyCode,
      recordedAt: priceRecords.recordedAt,
      recordedById: priceRecords.recordedById,
      storeName: stores.name,
    })
    .from(priceRecords)
    .innerJoin(stores, eq(stores.id, priceRecords.storeId))
    .where(eq(priceRecords.productId, productId))
    .orderBy(priceRecords.storeId, desc(priceRecords.recordedAt));

  return latest
    .map((r) => ({
      id: r.id,
      productId: r.productId,
      storeId: r.storeId,
      storeName: r.storeName,
      price: r.price,
      currencyCode: r.currencyCode,
      recordedAt: r.recordedAt.toISOString(),
      recordedBy: r.recordedById,
    }))
    .sort((a, b) => a.price - b.price);
}

// ==================== Helpers ====================

function formatProduct(p: typeof products.$inferSelect): ProductResponse {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    imageUrl: p.imageUrl,
    nutritionalFacts: p.nutritionalFacts,
    nutritionBaseAmount: p.nutritionBaseAmount,
    nutritionBaseUnit: p.nutritionBaseUnit,
    createdAt: p.createdAt.toISOString(),
  };
}
