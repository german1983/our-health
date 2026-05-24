import { z } from 'zod';
import type { NutritionalFacts } from './grocery.js';
import { unitCodeSchema } from '../units.js';

export const mealSlotEnum = z.enum([
  'BREAKFAST',
  'MID_MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
  'EVENING_SNACK',
]);

export type MealSlot = z.infer<typeof mealSlotEnum>;

// ==================== Serving Units ====================

export const createServingUnitSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1, 'Unit name is required').max(50),
  baseUnitEquivalent: z.number().positive('Base unit equivalent must be positive'),
  /** Unit `baseUnitEquivalent` is expressed in. Null/omitted = product's base unit. */
  targetUnit: z.string().nullable().optional(),
});

export const updateServingUnitSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  baseUnitEquivalent: z.number().positive().optional(),
  targetUnit: z.string().nullable().optional(),
});

export type CreateServingUnitInput = z.infer<typeof createServingUnitSchema>;
export type UpdateServingUnitInput = z.infer<typeof updateServingUnitSchema>;

// ==================== Intake Entries ====================

export const createIntakeEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    mealSlot: mealSlotEnum,
    productId: z.string().uuid().optional(),
    recipeId: z.string().uuid().optional(),
    quantity: z.number().positive('Quantity must be positive'),
    servingUnitId: z.string().uuid().optional(),
    unit: unitCodeSchema.optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.productId || data.recipeId, {
    message: 'Either productId or recipeId must be provided',
  })
  .refine((data) => !(data.productId && data.recipeId), {
    message: 'Cannot specify both productId and recipeId',
  })
  .refine((data) => !(data.servingUnitId && data.unit), {
    message: 'Cannot specify both servingUnitId and unit',
  });

export const updateIntakeEntrySchema = z
  .object({
    mealSlot: mealSlotEnum.optional(),
    quantity: z.number().positive().optional(),
    servingUnitId: z.string().uuid().nullable().optional(),
    unit: unitCodeSchema.nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((data) => !(data.servingUnitId && data.unit), {
    message: 'Cannot specify both servingUnitId and unit',
  });

export type CreateIntakeEntryInput = z.infer<typeof createIntakeEntrySchema>;
export type UpdateIntakeEntryInput = z.infer<typeof updateIntakeEntrySchema>;

// ==================== Queries ====================

export const dailyLogQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export const intakeSummaryQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export type DailyLogQueryInput = z.infer<typeof dailyLogQuerySchema>;
export type IntakeSummaryQueryInput = z.infer<typeof intakeSummaryQuerySchema>;

// ==================== Response Types ====================

export interface ServingUnitResponse {
  id: string;
  productId: string;
  name: string;
  baseUnitEquivalent: number;
  /** Null means the product's nutrition_base_unit. */
  targetUnit: string | null;
}

export interface IntakeEntryResponse {
  id: string;
  mealSlot: MealSlot;
  productId: string | null;
  productName: string | null;
  recipeId: string | null;
  recipeName: string | null;
  quantity: number;
  servingUnitId: string | null;
  servingUnitName: string | null;
  /** Standard unit code (from units.ts) when the user used one. */
  unit: string | null;
  /** Quantity converted to the product's nutritionBaseUnit (e.g. grams), if computable. */
  calculatedAmount: number | null;
  /** The product's nutritionBaseUnit code, copied here for display. */
  calculatedUnit: string | null;
  nutrition: NutritionalFacts | null;
  notes: string | null;
  sortOrder: number;
}

export interface MealGroup {
  mealSlot: MealSlot;
  entries: IntakeEntryResponse[];
  nutrition: NutritionalFacts;
}

export interface DailyLogResponse {
  id: string | null;
  date: string;
  notes: string | null;
  meals: MealGroup[];
  totalNutrition: NutritionalFacts;
}

export interface IntakeSummaryResponse {
  date: string;
  totalNutrition: NutritionalFacts;
}
