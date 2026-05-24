import { and, eq, ilike, or, asc, desc, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  brands,
  products,
  productImages,
  productPresentations,
  stores,
  priceRecords,
  storageItems,
  storageSpaces,
  receiptItems,
  receipts,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { fetchProductByBarcode } from '../../integrations/open-food-facts.js';
import type {
  BarcodePreviewResponse,
  CreateProductInput,
  UpdateProductInput,
  CreateProductImageInput,
  UpdateProductImageInput,
  CreateProductPresentationInput,
  UpdateProductPresentationInput,
  CreateStoreInput,
  UpdateStoreInput,
  CreatePriceRecordInput,
  BrandResponse,
  NutritionalFacts,
  ProductCreateDefaultPresentationInput,
  ProductImageResponse,
  ProductResponse,
  ProductDetailResponse,
  ProductPresentationResponse,
  ProductStorageEntry,
  ProductPurchaseEntry,
  StoreResponse,
  PriceRecordResponse,
} from '@personal-budget/shared';

// ==================== Products ====================

/**
 * Find a product by scanned barcode. Looks at the presentation barcodes
 * first (Model B: barcode lives on the SKU, not the conceptual product);
 * falls back to creating a new Product + default Presentation from OFF data
 * if nothing local matches.
 */
export async function lookupByBarcode(barcode: string): Promise<ProductResponse> {
  const match = await db.query.productPresentations.findFirst({
    where: eq(productPresentations.barcode, barcode),
    with: { product: { with: { category: true, presentations: true, brandRef: true, images: true } } },
  });
  if (match?.product) return formatProduct(match.product);

  const offData = await fetchProductByBarcode(barcode);
  if (!offData) throw new NotFoundError('Product not found for this barcode');

  const size = offData.packageSize;
  return createProduct({
    name: offData.name,
    brand: offData.brand ?? undefined,
    imageUrl: offData.imageUrl ?? undefined,
    nutritionalFacts: offData.nutritionalFacts ?? undefined,
    defaultPresentation: {
      name: offData.packageSizeLabel ?? 'Default',
      amount: size?.amount ?? 1,
      unit: size?.unit ?? 'unit',
      barcode,
    },
  });
}

/**
 * Decide what to do when an unknown barcode is scanned in the receipt flow.
 * The client uses this to offer the user three options: pick the existing
 * match, create a new product, or attach to an existing product (new size
 * or barcode reissue).
 */
export async function previewBarcode(barcode: string): Promise<BarcodePreviewResponse> {
  const match = await db.query.productPresentations.findFirst({
    where: eq(productPresentations.barcode, barcode),
    with: { product: { with: { category: true, presentations: true, brandRef: true, images: true } } },
  });
  if (match?.product) {
    return {
      kind: 'existing',
      product: formatProduct(match.product),
      presentationId: match.id,
    };
  }

  const offData = await fetchProductByBarcode(barcode);
  if (!offData) return { kind: 'not-found' };

  const size = offData.packageSize;
  return {
    kind: 'off-candidate',
    name: offData.name,
    brand: offData.brand,
    imageUrl: offData.imageUrl,
    nutritionalFacts: offData.nutritionalFacts,
    suggestedPresentation: size
      ? { name: offData.packageSizeLabel ?? `${size.amount} ${size.unit}`, amount: size.amount, unit: size.unit }
      : null,
  };
}

export async function searchProducts(query?: string, page = 1, limit = 20) {
  // Barcode lives on presentations now — `?query=` matching by barcode means
  // "does any presentation under this product have this barcode?" Brand
  // matches go through the brands table (which is now the source of truth).
  const where = query
    ? or(
        ilike(products.name, `%${query}%`),
        sql`EXISTS (
          SELECT 1 FROM ${brands} b
          WHERE b.id = ${products.brandId} AND b.name ILIKE ${`%${query}%`}
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${productPresentations} pp
          WHERE pp.product_id = ${products.id} AND pp.barcode ILIKE ${`%${query}%`}
        )`,
      )
    : undefined;

  const [items, total] = await Promise.all([
    db.query.products.findMany({
      where,
      orderBy: asc(products.name),
      limit,
      offset: (page - 1) * limit,
      with: { category: true, presentations: true, brandRef: true, images: true },
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

export async function getProductDetail(id: string, householdId: string): Promise<ProductDetailResponse> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: { category: true, presentations: true, brandRef: true, images: true },
  });
  if (!product) throw new NotFoundError('Product');

  const storageRows = await db
    .select({
      id: storageItems.id,
      storageSpaceId: storageItems.storageSpaceId,
      quantity: storageItems.quantity,
      unit: storageItems.unit,
      expiryDate: storageItems.expiryDate,
      addedAt: storageItems.addedAt,
      spaceName: storageSpaces.name,
      spaceType: storageSpaces.spaceType,
    })
    .from(storageItems)
    .innerJoin(storageSpaces, eq(storageSpaces.id, storageItems.storageSpaceId))
    .where(and(eq(storageItems.productId, id), eq(storageSpaces.householdId, householdId)))
    .orderBy(desc(storageItems.addedAt));

  const storageEntries: ProductStorageEntry[] = storageRows.map((r) => ({
    id: r.id,
    storageSpaceId: r.storageSpaceId,
    spaceName: r.spaceName,
    spaceType: r.spaceType,
    quantity: r.quantity,
    unit: r.unit,
    expiryDate: r.expiryDate?.toISOString() ?? null,
    addedAt: r.addedAt.toISOString(),
  }));

  const purchaseRows = await db
    .select({
      receiptItemId: receiptItems.id,
      receiptId: receiptItems.receiptId,
      rawName: receiptItems.rawName,
      quantity: receiptItems.quantity,
      unitPrice: receiptItems.unitPrice,
      lineTotal: receiptItems.lineTotal,
      purchasedAt: receipts.purchasedAt,
      storeId: receipts.storeId,
      storeName: stores.name,
      currencyCode: receipts.currencyCode,
    })
    .from(receiptItems)
    .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .leftJoin(stores, eq(stores.id, receipts.storeId))
    .where(and(eq(receiptItems.productId, id), eq(receipts.householdId, householdId)))
    .orderBy(desc(receipts.purchasedAt));

  const purchaseHistory: ProductPurchaseEntry[] = purchaseRows.map((r) => ({
    receiptItemId: r.receiptItemId,
    receiptId: r.receiptId,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    storeId: r.storeId,
    storeName: r.storeName,
    rawName: r.rawName,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    lineTotal: r.lineTotal,
    currencyCode: r.currencyCode,
  }));

  const presentations = await getProductPresentations(id);

  return {
    ...formatProduct(product),
    storageEntries,
    purchaseHistory,
    presentations,
  };
}

function formatPresentation(p: typeof productPresentations.$inferSelect): ProductPresentationResponse {
  return {
    id: p.id,
    productId: p.productId,
    name: p.name,
    amount: p.amount,
    unit: p.unit,
    barcode: p.barcode,
    isDefault: p.isDefault,
  };
}

export async function getProductPresentations(productId: string): Promise<ProductPresentationResponse[]> {
  const rows = await db.query.productPresentations.findMany({
    where: eq(productPresentations.productId, productId),
    orderBy: [desc(productPresentations.isDefault), asc(productPresentations.name)],
  });
  return rows.map(formatPresentation);
}

export async function addProductPresentation(
  productId: string,
  input: CreateProductPresentationInput,
): Promise<ProductPresentationResponse> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new NotFoundError('Product');

  await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(productPresentations)
        .set({ isDefault: false })
        .where(eq(productPresentations.productId, productId));
    }
    await tx.insert(productPresentations).values({
      productId,
      name: input.name,
      amount: input.amount,
      unit: input.unit,
      barcode: input.barcode ?? null,
      isDefault: input.isDefault ?? false,
    });
  });

  const created = await db.query.productPresentations.findFirst({
    where: and(
      eq(productPresentations.productId, productId),
      eq(productPresentations.name, input.name),
    ),
    orderBy: desc(productPresentations.createdAt),
  });
  return formatPresentation(created!);
}

export async function updateProductPresentation(
  id: string,
  input: UpdateProductPresentationInput,
): Promise<ProductPresentationResponse> {
  const existing = await db.query.productPresentations.findFirst({
    where: eq(productPresentations.id, id),
  });
  if (!existing) throw new NotFoundError('Presentation');

  await db.transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx
        .update(productPresentations)
        .set({ isDefault: false })
        .where(eq(productPresentations.productId, existing.productId));
    }
    const updates: Partial<typeof productPresentations.$inferInsert> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.amount !== undefined) updates.amount = input.amount;
    if (input.unit !== undefined) updates.unit = input.unit;
    if (input.barcode !== undefined) updates.barcode = input.barcode ?? null;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (Object.keys(updates).length > 0) {
      await tx.update(productPresentations).set(updates).where(eq(productPresentations.id, id));
    }
  });

  const updated = await db.query.productPresentations.findFirst({
    where: eq(productPresentations.id, id),
  });
  return formatPresentation(updated!);
}

export async function deleteProductPresentation(id: string): Promise<void> {
  const existing = await db.query.productPresentations.findFirst({
    where: eq(productPresentations.id, id),
  });
  if (!existing) throw new NotFoundError('Presentation');
  await db.delete(productPresentations).where(eq(productPresentations.id, id));
}

// ==================== Product Images ====================

function formatProductImage(img: typeof productImages.$inferSelect): ProductImageResponse {
  return {
    id: img.id,
    productId: img.productId,
    url: img.url,
    isPrimary: img.isPrimary,
    sortOrder: img.sortOrder,
  };
}

export async function getProductImages(productId: string): Promise<ProductImageResponse[]> {
  const rows = await db.query.productImages.findMany({
    where: eq(productImages.productId, productId),
    orderBy: [asc(productImages.sortOrder), asc(productImages.createdAt)],
  });
  return rows.map(formatProductImage);
}

export async function addProductImage(
  productId: string,
  input: CreateProductImageInput,
): Promise<ProductImageResponse> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new NotFoundError('Product');

  const inserted = await db.transaction(async (tx) => {
    if (input.isPrimary) {
      // At most one primary per product — clear the previous one first.
      await tx
        .update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, productId));
    }
    const [row] = await tx
      .insert(productImages)
      .values({
        productId,
        url: input.url,
        isPrimary: input.isPrimary ?? false,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return row;
  });

  return formatProductImage(inserted);
}

export async function updateProductImage(
  id: string,
  input: UpdateProductImageInput,
): Promise<ProductImageResponse> {
  const existing = await db.query.productImages.findFirst({
    where: eq(productImages.id, id),
  });
  if (!existing) throw new NotFoundError('Image');

  const updated = await db.transaction(async (tx) => {
    if (input.isPrimary === true) {
      await tx
        .update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, existing.productId));
    }
    const updates: Partial<typeof productImages.$inferInsert> = {};
    if (input.url !== undefined) updates.url = input.url;
    if (input.isPrimary !== undefined) updates.isPrimary = input.isPrimary;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
    if (Object.keys(updates).length > 0) {
      await tx.update(productImages).set(updates).where(eq(productImages.id, id));
    }
    const [row] = await tx
      .select()
      .from(productImages)
      .where(eq(productImages.id, id));
    return row;
  });

  return formatProductImage(updated);
}

export async function deleteProductImage(id: string): Promise<void> {
  const existing = await db.query.productImages.findFirst({
    where: eq(productImages.id, id),
  });
  if (!existing) throw new NotFoundError('Image');
  await db.delete(productImages).where(eq(productImages.id, id));
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<ProductResponse> {
  const existing = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: { category: true, presentations: true, brandRef: true, images: true },
  });
  if (!existing) throw new NotFoundError('Product');

  const updates: Partial<typeof products.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
  if (input.nutritionalFacts !== undefined) updates.nutritionalFacts = input.nutritionalFacts;
  if (input.nutritionBaseAmount !== undefined) updates.nutritionBaseAmount = input.nutritionBaseAmount;
  if (input.nutritionBaseUnit !== undefined) updates.nutritionBaseUnit = input.nutritionBaseUnit;

  if (input.brand !== undefined) {
    if (input.brand) {
      const [brand] = await db
        .insert(brands)
        .values({ name: input.brand })
        .onConflictDoUpdate({ target: brands.name, set: { name: input.brand } })
        .returning();
      updates.brandId = brand.id;
    } else {
      updates.brandId = null;
    }
  }

  if (Object.keys(updates).length === 0) return formatProduct(existing);

  await db.update(products).set(updates).where(eq(products.id, id));
  const updated = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: { category: true, presentations: true, brandRef: true, images: true },
  });
  return formatProduct(updated!);
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

  // Always seed a default presentation. If the caller supplied size info,
  // use it; otherwise plant a placeholder so the product is immediately usable
  // in receipts and storage.
  const defaultPres: ProductCreateDefaultPresentationInput = input.defaultPresentation ?? {
    name: 'Default',
    amount: 1,
    unit: 'unit',
  };

  const newProductId = await db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        name: input.name,
        brandId,
        categoryId: input.categoryId ?? null,
        nutritionalFacts: (input.nutritionalFacts ?? null) as NutritionalFacts | null,
        nutritionBaseAmount: input.nutritionBaseAmount ?? 100,
        nutritionBaseUnit: input.nutritionBaseUnit ?? 'g',
      })
      .returning({ id: products.id });

    await tx.insert(productPresentations).values({
      productId: product.id,
      name: defaultPres.name,
      amount: defaultPres.amount,
      unit: defaultPres.unit,
      barcode: defaultPres.barcode ?? null,
      isDefault: true,
    });

    // Seed the primary image when one was supplied at create time. Further
    // images get added/managed through the dedicated /images endpoints.
    if (input.imageUrl) {
      await tx.insert(productImages).values({
        productId: product.id,
        url: input.imageUrl,
        isPrimary: true,
        sortOrder: 0,
      });
    }

    return product.id;
  });

  const created = await db.query.products.findFirst({
    where: eq(products.id, newProductId),
    with: { category: true, presentations: true, brandRef: true, images: true },
  });
  return formatProduct(created!);
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

type ProductWithCategory = typeof products.$inferSelect & {
  category?: { id: string; name: string; hasNutritionalFacts: boolean } | null;
  /** Brand reference — brand name now lives on the brands table. */
  brandRef?: { id: string; name: string } | null;
  /** Optional — present when the caller joined presentations for the barcode hoist. */
  presentations?: { id: string; isDefault: boolean; barcode: string | null }[];
  /** Optional — present when the caller joined images for the gallery. */
  images?: { id: string; productId: string; url: string; isPrimary: boolean; sortOrder: number; createdAt: Date }[];
};

function formatProduct(p: ProductWithCategory): ProductResponse {
  const defaultBarcode =
    p.presentations?.find((pp) => pp.isDefault)?.barcode ?? null;
  const orderedImages = (p.images ?? [])
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
  // imageUrl is the primary image's url; fall back to the first image when no
  // row is flagged primary (e.g., legacy data freshly inserted).
  const primary = orderedImages.find((img) => img.isPrimary) ?? orderedImages[0];
  return {
    id: p.id,
    barcode: defaultBarcode,
    name: p.name,
    brand: p.brandRef?.name ?? null,
    imageUrl: primary?.url ?? null,
    images: orderedImages.map((img) => ({
      id: img.id,
      productId: img.productId,
      url: img.url,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
    })),
    categoryId: p.categoryId ?? null,
    categoryName: p.category?.name ?? null,
    categoryHasNutritionalFacts: p.category?.hasNutritionalFacts ?? false,
    nutritionalFacts: p.nutritionalFacts,
    nutritionBaseAmount: p.nutritionBaseAmount,
    nutritionBaseUnit: p.nutritionBaseUnit,
    createdAt: p.createdAt.toISOString(),
  };
}
