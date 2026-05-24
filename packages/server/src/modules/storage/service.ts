import { and, eq, inArray, asc, desc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  productServingUnits,
  products,
  storageSpaces,
  storageItems,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { areUnitsCompatible, convertUnit, UNITS } from '@personal-budget/shared';
import type {
  CreateStorageSpaceInput,
  UpdateStorageSpaceInput,
  CreateStorageItemInput,
  UpdateStorageItemInput,
  InventoryByProductEntry,
  StorageSpaceResponse,
  StorageItemResponse,
} from '@personal-budget/shared';

// ==================== Storage Spaces ====================

export async function getSpaces(householdId: string): Promise<StorageSpaceResponse[]> {
  const spaces = await db.query.storageSpaces.findMany({
    where: eq(storageSpaces.householdId, householdId),
    with: { items: { columns: { id: true } } },
    orderBy: asc(storageSpaces.sortOrder),
  });

  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    spaceType: s.spaceType,
    sortOrder: s.sortOrder,
    itemCount: s.items.length,
  }));
}

export async function createSpace(
  input: CreateStorageSpaceInput,
  householdId: string,
): Promise<StorageSpaceResponse> {
  const [space] = await db
    .insert(storageSpaces)
    .values({
      householdId,
      name: input.name,
      description: input.description,
      spaceType: input.spaceType,
      sortOrder: input.sortOrder,
    })
    .returning();

  return {
    id: space.id,
    name: space.name,
    description: space.description,
    spaceType: space.spaceType,
    sortOrder: space.sortOrder,
    itemCount: 0,
  };
}

export async function updateSpace(
  id: string,
  input: UpdateStorageSpaceInput,
  householdId: string,
): Promise<StorageSpaceResponse> {
  const [space] = await db
    .update(storageSpaces)
    .set(input)
    .where(and(eq(storageSpaces.id, id), eq(storageSpaces.householdId, householdId)))
    .returning();

  if (!space) throw new NotFoundError('Storage space');

  const itemCount = await db.$count(storageItems, eq(storageItems.storageSpaceId, id));

  return {
    id: space.id,
    name: space.name,
    description: space.description,
    spaceType: space.spaceType,
    sortOrder: space.sortOrder,
    itemCount,
  };
}

export async function deleteSpace(id: string, householdId: string): Promise<void> {
  await db
    .delete(storageSpaces)
    .where(and(eq(storageSpaces.id, id), eq(storageSpaces.householdId, householdId)));
}

// ==================== Storage Items ====================

type ItemWithRelations = {
  id: string;
  storageSpaceId: string;
  productId: string;
  quantity: number;
  unit: string;
  addedAt: Date;
  expiryDate: Date | null;
  product: { name: string };
  storageSpace: { name: string; sortOrder: number };
  addedBy: { name: string };
};

const itemRelations = {
  product: true,
  storageSpace: true,
  addedBy: true,
} as const;

export async function getSpaceItems(spaceId: string): Promise<StorageItemResponse[]> {
  const items = await db.query.storageItems.findMany({
    where: eq(storageItems.storageSpaceId, spaceId),
    with: itemRelations,
    orderBy: desc(storageItems.addedAt),
  });
  return items.map((i) => formatItem(i as unknown as ItemWithRelations));
}

export async function addItem(
  input: CreateStorageItemInput,
  userId: string,
): Promise<StorageItemResponse> {
  const [inserted] = await db
    .insert(storageItems)
    .values({
      storageSpaceId: input.storageSpaceId,
      productId: input.productId,
      quantity: input.quantity,
      unit: input.unit,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      addedById: userId,
    })
    .returning({ id: storageItems.id });

  const item = await db.query.storageItems.findFirst({
    where: eq(storageItems.id, inserted.id),
    with: itemRelations,
  });
  return formatItem(item as unknown as ItemWithRelations);
}

export async function updateItem(
  id: string,
  input: UpdateStorageItemInput,
): Promise<StorageItemResponse> {
  const expiryDate =
    input.expiryDate === null ? null : input.expiryDate ? new Date(input.expiryDate) : undefined;

  await db
    .update(storageItems)
    .set({
      quantity: input.quantity,
      unit: input.unit,
      storageSpaceId: input.storageSpaceId,
      expiryDate,
    })
    .where(eq(storageItems.id, id));

  const item = await db.query.storageItems.findFirst({
    where: eq(storageItems.id, id),
    with: itemRelations,
  });
  if (!item) throw new NotFoundError('Storage item');
  return formatItem(item as unknown as ItemWithRelations);
}

export async function removeItem(id: string): Promise<void> {
  await db.delete(storageItems).where(eq(storageItems.id, id));
}

export async function getFullInventory(householdId: string): Promise<StorageItemResponse[]> {
  const items = (await db.query.storageItems.findMany({
    where: inArray(
      storageItems.storageSpaceId,
      db.select({ id: storageSpaces.id }).from(storageSpaces).where(eq(storageSpaces.householdId, householdId)),
    ),
    with: itemRelations,
  })) as unknown as ItemWithRelations[];

  items.sort((a, b) => {
    const diff = a.storageSpace.sortOrder - b.storageSpace.sortOrder;
    if (diff !== 0) return diff;
    return b.addedAt.getTime() - a.addedAt.getTime();
  });

  return items.map(formatItem);
}

function formatItem(item: ItemWithRelations): StorageItemResponse {
  return {
    id: item.id,
    storageSpaceId: item.storageSpaceId,
    spaceName: item.storageSpace.name,
    productId: item.productId,
    productName: item.product.name,
    quantity: item.quantity,
    unit: item.unit,
    addedAt: item.addedAt.toISOString(),
    expiryDate: item.expiryDate?.toISOString() ?? null,
    addedBy: item.addedBy.name,
  };
}

// ==================== Aggregation ====================

type AggregationFamily = 'mass' | 'volume' | 'count' | 'unknown';

/** Map a unit code to a normalized "family" tag for grouping in the aggregate. */
function familyOf(unit: string): AggregationFamily {
  const def = UNITS[unit];
  if (!def) return 'unknown';
  if (def.family === 'MASS') return 'mass';
  if (def.family === 'VOLUME') return 'volume';
  return 'count';
}

/** Canonical unit per family — what the rolled-up total is reported in. */
const CANONICAL_UNIT: Record<AggregationFamily, string> = {
  mass: 'g',
  volume: 'ml',
  count: 'unit',
  unknown: 'unit',
};

/**
 * Sum every household storage row per product, grouped by unit family.
 * Rolls a 600 g + 250 g bag of Nutella into a single 850 g entry; keeps
 * a 1 jar entry separate from the mass total because they're different
 * dimensions. Caller (recipe availability or storage UI) decides how to
 * present per-family totals.
 */
export async function getInventoryByProduct(householdId: string): Promise<InventoryByProductEntry[]> {
  // One round-trip pulling every storage row that belongs to the household
  // along with the product's display name and base unit.
  const rows = await db
    .select({
      productId: storageItems.productId,
      productName: products.name,
      productBaseUnit: products.nutritionBaseUnit,
      quantity: storageItems.quantity,
      unit: storageItems.unit,
    })
    .from(storageItems)
    .innerJoin(storageSpaces, eq(storageSpaces.id, storageItems.storageSpaceId))
    .innerJoin(products, eq(products.id, storageItems.productId))
    .where(eq(storageSpaces.householdId, householdId));

  if (rows.length === 0) return [];

  // Pull the custom serving units for the products we just saw — they widen
  // the convertible set (e.g. "1 slice = 21 g" lets a 'slice'-typed storage
  // row roll up into the mass total).
  const productIds = Array.from(new Set(rows.map((r) => r.productId)));
  const servingUnits = await db
    .select({
      productId: productServingUnits.productId,
      name: productServingUnits.name,
      baseUnitEquivalent: productServingUnits.baseUnitEquivalent,
    })
    .from(productServingUnits)
    .where(inArray(productServingUnits.productId, productIds));

  const servingUnitsByProduct = new Map<string, { name: string; baseUnitEquivalent: number }[]>();
  for (const su of servingUnits) {
    const list = servingUnitsByProduct.get(su.productId);
    if (list) list.push(su);
    else servingUnitsByProduct.set(su.productId, [su]);
  }

  // Bucket rows by product, then by family. Each bucket sums in the family's
  // canonical unit so a 1 kg + 500 g rollup produces 1500 g.
  type Bucket = { family: AggregationFamily; quantity: number; unit: string };
  type Acc = {
    productName: string;
    productBaseUnit: string;
    lotCount: number;
    buckets: Map<string, Bucket>;
  };
  const byProduct = new Map<string, Acc>();

  for (const row of rows) {
    let acc = byProduct.get(row.productId);
    if (!acc) {
      acc = {
        productName: row.productName,
        productBaseUnit: row.productBaseUnit,
        lotCount: 0,
        buckets: new Map(),
      };
      byProduct.set(row.productId, acc);
    }
    acc.lotCount += 1;

    // Try the physical conversion first. If the row's unit is one of our
    // known unit codes, it belongs to mass/volume/count and we can collapse
    // it into the family's canonical unit.
    if (UNITS[row.unit]) {
      const family = familyOf(row.unit);
      const canonical = CANONICAL_UNIT[family];
      const converted = convertUnit(row.quantity, row.unit, canonical);
      const key = `phys:${family}`;
      const existing = acc.buckets.get(key);
      if (existing) existing.quantity += converted;
      else acc.buckets.set(key, { family, quantity: converted, unit: canonical });
      continue;
    }

    // Custom serving unit (e.g. "slice"): if defined, expand into the
    // product's nutrition base unit so it stacks with the physical totals
    // for that family.
    const custom = servingUnitsByProduct
      .get(row.productId)
      ?.find((u) => u.name === row.unit);
    if (custom && UNITS[acc.productBaseUnit]) {
      const family = familyOf(acc.productBaseUnit);
      const canonical = CANONICAL_UNIT[family];
      const converted = convertUnit(
        row.quantity * custom.baseUnitEquivalent,
        acc.productBaseUnit,
        canonical,
      );
      const key = `phys:${family}`;
      const existing = acc.buckets.get(key);
      if (existing) existing.quantity += converted;
      else acc.buckets.set(key, { family, quantity: converted, unit: canonical });
      continue;
    }

    // Anything left over: stash under the raw unit name so the user at least
    // sees it. They can convert by adding a custom unit definition.
    const key = `raw:${row.unit}`;
    const existing = acc.buckets.get(key);
    if (existing) existing.quantity += row.quantity;
    else acc.buckets.set(key, { family: 'unknown', quantity: row.quantity, unit: row.unit });
  }

  const result: InventoryByProductEntry[] = [];
  for (const [productId, acc] of byProduct.entries()) {
    result.push({
      productId,
      productName: acc.productName,
      lotCount: acc.lotCount,
      totals: Array.from(acc.buckets.values()).sort((a, b) =>
        a.family === b.family ? a.unit.localeCompare(b.unit) : a.family.localeCompare(b.family),
      ),
    });
  }
  result.sort((a, b) => a.productName.localeCompare(b.productName));
  return result;
}
