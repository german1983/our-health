import { z } from 'zod';
import type { NutritionalFacts } from './grocery.js';
import { unitCodeSchema } from '../units.js';

export const recipeIngredientSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: unitCodeSchema,
  notes: z.string().max(200).optional(),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1, 'Recipe name is required').max(200),
  description: z.string().max(2000).optional(),
  servings: z.number().int().positive().default(1),
  servingUnit: z.string().max(50).optional(),
  servingWeightGrams: z.number().positive().optional(),
  prepTime: z.number().int().min(0).optional(),
  cookTime: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  ingredients: z.array(recipeIngredientSchema).min(1, 'At least one ingredient is required'),
});

export const updateRecipeSchema = createRecipeSchema.partial().extend({
  ingredients: z.array(recipeIngredientSchema).min(1).optional(),
});

export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export interface RecipeIngredientResponse {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  notes: string | null;
  nutritionalFacts: NutritionalFacts | null;
}

export interface RecipeResponse {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  servingUnit: string | null;
  servingWeightGrams: number | null;
  /** servings × servingWeightGrams, when both are known. */
  totalWeightGrams: number | null;
  /** Calories per 100 g of recipe yield, when totalWeightGrams is known. */
  caloriesPer100g: number | null;
  /** Calories per serving (one unit of yield). */
  caloriesPerServing: number | null;
  prepTime: number | null;
  cookTime: number | null;
  imageUrl: string | null;
  source: 'USER' | 'EXTERNAL';
  createdBy: string;
  createdAt: string;
}

export interface RecipeDetailResponse extends RecipeResponse {
  ingredients: RecipeIngredientResponse[];
  totalNutrition: NutritionalFacts;
  perServingNutrition: NutritionalFacts;
  /** Nutrition normalized to 100 g of recipe yield, when totalWeightGrams is known. */
  per100gNutrition: NutritionalFacts | null;
}

export interface RecipeSuggestionResponse extends RecipeResponse {
  availableIngredients: number;
  totalIngredients: number;
  missingIngredients: { productId: string; productName: string; quantity: number; unit: string }[];
  matchScore: number;
}

/**
 * Per-ingredient availability for a recipe. `have` and `need` are normalized
 * to the same canonical unit when conversion is possible (via physical units
 * or the product's custom serving units); when not, `status` is 'unknown'
 * and the caller should display a warning instead of a quantitative compare.
 */
export interface RecipeIngredientAvailability {
  ingredientId: string;
  productId: string;
  productName: string;
  /** As stored on the recipe. */
  needed: number;
  neededUnit: string;
  /** Sum of compatible storage rows in `canonicalUnit`. */
  have: number;
  /** Unit used for the compare; usually the product's nutrition base unit. */
  canonicalUnit: string;
  /** Number of storage rows that couldn't be converted into the canonical unit. */
  unconvertible: number;
  status: 'sufficient' | 'short' | 'unknown';
  /** Positive when short; in canonicalUnit. */
  missing: number;
}

export interface RecipeAvailabilityResponse {
  recipeId: string;
  canCook: boolean;
  /** Sum sufficient / total — 1.0 means every ingredient is covered. */
  matchScore: number;
  ingredients: RecipeIngredientAvailability[];
}
