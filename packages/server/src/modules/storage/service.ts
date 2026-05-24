import { and, eq, inArray, asc, desc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { storageSpaces, storageItems } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type {
  CreateStorageSpaceInput,
  UpdateStorageSpaceInput,
  CreateStorageItemInput,
  UpdateStorageItemInput,
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
