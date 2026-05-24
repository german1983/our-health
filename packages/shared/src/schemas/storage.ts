import { z } from 'zod';
import { unitCodeSchema } from '../units.js';

export const spaceTypeEnum = z.enum(['FRIDGE', 'FREEZER', 'PANTRY', 'CABINET', 'OTHER']);

export const createStorageSpaceSchema = z.object({
  name: z.string().min(1, 'Space name is required').max(100),
  description: z.string().max(500).optional(),
  spaceType: spaceTypeEnum.default('OTHER'),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateStorageSpaceSchema = createStorageSpaceSchema.partial();

export const createStorageItemSchema = z.object({
  storageSpaceId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
  unit: unitCodeSchema.default('unit'),
  expiryDate: z.string().datetime().optional(),
});

export const updateStorageItemSchema = z.object({
  quantity: z.number().positive().optional(),
  unit: unitCodeSchema.optional(),
  storageSpaceId: z.string().uuid().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
});

export type SpaceType = z.infer<typeof spaceTypeEnum>;
export type CreateStorageSpaceInput = z.infer<typeof createStorageSpaceSchema>;
export type UpdateStorageSpaceInput = z.infer<typeof updateStorageSpaceSchema>;
export type CreateStorageItemInput = z.infer<typeof createStorageItemSchema>;
export type UpdateStorageItemInput = z.infer<typeof updateStorageItemSchema>;

export interface StorageSpaceResponse {
  id: string;
  name: string;
  description: string | null;
  spaceType: SpaceType;
  sortOrder: number;
  itemCount: number;
}

export interface StorageItemResponse {
  id: string;
  storageSpaceId: string;
  spaceName: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  addedAt: string;
  expiryDate: string | null;
  addedBy: string;
}
