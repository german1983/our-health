import { prisma } from '../../lib/prisma.js';
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
  const spaces = await prisma.storageSpace.findMany({
    where: { householdId },
    include: { _count: { select: { items: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    spaceType: s.spaceType,
    sortOrder: s.sortOrder,
    itemCount: s._count.items,
  }));
}

export async function createSpace(input: CreateStorageSpaceInput, householdId: string): Promise<StorageSpaceResponse> {
  const space = await prisma.storageSpace.create({
    data: {
      householdId,
      name: input.name,
      description: input.description,
      spaceType: input.spaceType,
      sortOrder: input.sortOrder,
    },
    include: { _count: { select: { items: true } } },
  });

  return {
    id: space.id,
    name: space.name,
    description: space.description,
    spaceType: space.spaceType,
    sortOrder: space.sortOrder,
    itemCount: space._count.items,
  };
}

export async function updateSpace(
  id: string,
  input: UpdateStorageSpaceInput,
  householdId: string,
): Promise<StorageSpaceResponse> {
  const space = await prisma.storageSpace.update({
    where: { id, householdId },
    data: input,
    include: { _count: { select: { items: true } } },
  });

  return {
    id: space.id,
    name: space.name,
    description: space.description,
    spaceType: space.spaceType,
    sortOrder: space.sortOrder,
    itemCount: space._count.items,
  };
}

export async function deleteSpace(id: string, householdId: string): Promise<void> {
  await prisma.storageSpace.delete({ where: { id, householdId } });
}

// ==================== Storage Items ====================

export async function getSpaceItems(spaceId: string): Promise<StorageItemResponse[]> {
  const items = await prisma.storageItem.findMany({
    where: { storageSpaceId: spaceId },
    include: { product: true, storageSpace: true, addedBy: true },
    orderBy: { addedAt: 'desc' },
  });

  return items.map(formatItem);
}

export async function addItem(input: CreateStorageItemInput, userId: string): Promise<StorageItemResponse> {
  const item = await prisma.storageItem.create({
    data: {
      storageSpaceId: input.storageSpaceId,
      productId: input.productId,
      quantity: input.quantity,
      unit: input.unit,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
      addedById: userId,
    },
    include: { product: true, storageSpace: true, addedBy: true },
  });

  return formatItem(item);
}

export async function updateItem(id: string, input: UpdateStorageItemInput): Promise<StorageItemResponse> {
  const item = await prisma.storageItem.update({
    where: { id },
    data: {
      quantity: input.quantity,
      unit: input.unit,
      storageSpaceId: input.storageSpaceId,
      expiryDate: input.expiryDate === null ? null : input.expiryDate ? new Date(input.expiryDate) : undefined,
    },
    include: { product: true, storageSpace: true, addedBy: true },
  });

  return formatItem(item);
}

export async function removeItem(id: string): Promise<void> {
  await prisma.storageItem.delete({ where: { id } });
}

export async function getFullInventory(householdId: string): Promise<StorageItemResponse[]> {
  const items = await prisma.storageItem.findMany({
    where: { storageSpace: { householdId } },
    include: { product: true, storageSpace: true, addedBy: true },
    orderBy: [{ storageSpace: { sortOrder: 'asc' } }, { addedAt: 'desc' }],
  });

  return items.map(formatItem);
}

function formatItem(item: {
  id: string;
  storageSpaceId: string;
  storageSpace: { name: string };
  productId: string;
  product: { name: string; barcode: string | null };
  quantity: number;
  unit: string;
  addedAt: Date;
  expiryDate: Date | null;
  addedBy: { name: string };
  addedById: string;
}): StorageItemResponse {
  return {
    id: item.id,
    storageSpaceId: item.storageSpaceId,
    spaceName: item.storageSpace.name,
    productId: item.productId,
    productName: item.product.name,
    productBarcode: item.product.barcode,
    quantity: item.quantity,
    unit: item.unit,
    addedAt: item.addedAt.toISOString(),
    expiryDate: item.expiryDate?.toISOString() ?? null,
    addedBy: item.addedBy.name,
  };
}
