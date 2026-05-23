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
}

export interface RecipeSuggestionResponse extends RecipeResponse {
  availableIngredients: number;
  totalIngredients: number;
  missingIngredients: { productId: string; productName: string; quantity: number; unit: string }[];
  matchScore: number;
}
