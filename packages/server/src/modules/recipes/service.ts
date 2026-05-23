import { and, eq, gt, desc, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { recipes, recipeIngredients, storageItems, storageSpaces } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { areUnitsCompatible, convertUnit } from '@personal-budget/shared';
import type {
  CreateRecipeInput,
  UpdateRecipeInput,
  NutritionalFacts,
  RecipeResponse,
  RecipeDetailResponse,
  RecipeSuggestionResponse,
} from '@personal-budget/shared';

type RecipeWithRelations = {
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
  createdById: string;
  createdAt: Date;
  createdBy: { name: string };
  ingredients?: {
    id: string;
    productId: string;
    quantity: number;
    unit: string;
    notes: string | null;
    product: {
      name: string;
      nutritionalFacts: NutritionalFacts | null;
      nutritionBaseAmount: number;
      nutritionBaseUnit: string;
    };
  }[];
};

export async function getRecipes(householdId: string): Promise<RecipeResponse[]> {
  const result = await db.query.recipes.findMany({
    where: eq(recipes.householdId, householdId),
    with: { createdBy: true },
    orderBy: desc(recipes.createdAt),
  });
  return result.map(formatRecipe);
}

export async function getRecipe(id: string, householdId: string): Promise<RecipeDetailResponse> {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), eq(recipes.householdId, householdId)),
    with: {
      createdBy: true,
      ingredients: { with: { product: true } },
    },
  });

  if (!recipe) throw new NotFoundError('Recipe');

  const ingredients = (recipe.ingredients ?? []).map((ing) => ({
    id: ing.id,
    productId: ing.productId,
    productName: ing.product.name,
    quantity: ing.quantity,
    unit: ing.unit,
    notes: ing.notes,
    nutritionalFacts: ing.product.nutritionalFacts,
    nutritionBaseAmount: ing.product.nutritionBaseAmount,
    nutritionBaseUnit: ing.product.nutritionBaseUnit,
  }));

  const totalNutrition = calculateTotalNutrition(ingredients);
  const perServingNutrition = divideNutrition(totalNutrition, recipe.servings);

  return {
    ...formatRecipe(recipe),
    ingredients,
    totalNutrition,
    perServingNutrition,
  };
}

export async function createRecipe(
  input: CreateRecipeInput,
  householdId: string,
  userId: string,
): Promise<RecipeDetailResponse> {
  const recipeId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(recipes)
      .values({
        householdId,
        name: input.name,
        description: input.description,
        servings: input.servings,
        servingUnit: input.servingUnit,
        servingWeightGrams: input.servingWeightGrams,
        prepTime: input.prepTime,
        cookTime: input.cookTime,
        imageUrl: input.imageUrl,
        createdById: userId,
      })
      .returning({ id: recipes.id });

    if (input.ingredients.length > 0) {
      await tx.insert(recipeIngredients).values(
        input.ingredients.map((ing) => ({
          recipeId: created.id,
          productId: ing.productId,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes,
        })),
      );
    }
    return created.id;
  });

  return getRecipe(recipeId, householdId);
}

export async function updateRecipe(
  id: string,
  input: UpdateRecipeInput,
  householdId: string,
): Promise<RecipeDetailResponse> {
  const existing = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), eq(recipes.householdId, householdId)),
  });
  if (!existing) throw new NotFoundError('Recipe');

  await db.transaction(async (tx) => {
    if (input.ingredients) {
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
      if (input.ingredients.length > 0) {
        await tx.insert(recipeIngredients).values(
          input.ingredients.map((ing) => ({
            recipeId: id,
            productId: ing.productId,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes,
          })),
        );
      }
    }

    const { ingredients: _ignored, ...recipeData } = input;
    if (Object.keys(recipeData).length > 0) {
      await tx.update(recipes).set(recipeData).where(eq(recipes.id, id));
    }
  });

  return getRecipe(id, householdId);
}

export async function deleteRecipe(id: string, householdId: string): Promise<void> {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), eq(recipes.householdId, householdId)),
  });
  if (!recipe) throw new NotFoundError('Recipe');
  await db.delete(recipes).where(eq(recipes.id, id));
}

export async function getSuggestions(householdId: string): Promise<RecipeSuggestionResponse[]> {
  const inventoryRows = await db
    .select({ productId: storageItems.productId })
    .from(storageItems)
    .innerJoin(storageSpaces, eq(storageSpaces.id, storageItems.storageSpaceId))
    .where(and(eq(storageSpaces.householdId, householdId), gt(storageItems.quantity, 0)));

  const inventoryProductIds = new Set(inventoryRows.map((r) => r.productId));

  const all = await db.query.recipes.findMany({
    where: eq(recipes.householdId, householdId),
    with: {
      createdBy: true,
      ingredients: { with: { product: true } },
    },
  });

  const suggestions: RecipeSuggestionResponse[] = all.map((recipe) => {
    const ings = recipe.ingredients ?? [];
    const totalIngredients = ings.length;
    const available = ings.filter((ing) => inventoryProductIds.has(ing.productId));
    const missing = ings
      .filter((ing) => !inventoryProductIds.has(ing.productId))
      .map((ing) => ({
        productId: ing.productId,
        productName: ing.product.name,
        quantity: ing.quantity,
        unit: ing.unit,
      }));

    const matchScore = totalIngredients > 0 ? available.length / totalIngredients : 0;

    return {
      ...formatRecipe(recipe),
      availableIngredients: available.length,
      totalIngredients,
      missingIngredients: missing,
      matchScore,
    };
  });

  return suggestions.sort((a, b) => b.matchScore - a.matchScore);
}

// ==================== Nutrition Helpers ====================

function calculateTotalNutrition(
  ingredients: {
    quantity: number;
    unit: string;
    nutritionalFacts: NutritionalFacts | null;
    nutritionBaseAmount?: number;
    nutritionBaseUnit?: string;
  }[],
): NutritionalFacts {
  const total: NutritionalFacts = {
    calories: 0,
    fat: 0,
    saturatedFat: 0,
    carbs: 0,
    sugars: 0,
    fiber: 0,
    protein: 0,
    sodium: 0,
    potassium: 0,
    calcium: 0,
    iron: 0,
    vitaminA: 0,
    vitaminD: 0,
    cholesterol: 0,
  };

  for (const ing of ingredients) {
    if (!ing.nutritionalFacts) continue;
    const baseAmount = ing.nutritionBaseAmount ?? 100;
    const baseUnit = ing.nutritionBaseUnit ?? 'g';
    // Convert the ingredient's quantity into the product's base unit; fall back
    // to treating quantity as base units if the families don't match.
    const qtyInBaseUnit = areUnitsCompatible(ing.unit, baseUnit)
      ? convertUnit(ing.quantity, ing.unit, baseUnit)
      : ing.quantity;
    const factor = qtyInBaseUnit / baseAmount;
    const nf = ing.nutritionalFacts;
    total.calories = (total.calories ?? 0) + (nf.calories ?? 0) * factor;
    total.fat = (total.fat ?? 0) + (nf.fat ?? 0) * factor;
    total.saturatedFat = (total.saturatedFat ?? 0) + (nf.saturatedFat ?? 0) * factor;
    total.carbs = (total.carbs ?? 0) + (nf.carbs ?? 0) * factor;
    total.sugars = (total.sugars ?? 0) + (nf.sugars ?? 0) * factor;
    total.fiber = (total.fiber ?? 0) + (nf.fiber ?? 0) * factor;
    total.protein = (total.protein ?? 0) + (nf.protein ?? 0) * factor;
    total.sodium = (total.sodium ?? 0) + (nf.sodium ?? 0) * factor;
    total.potassium = (total.potassium ?? 0) + (nf.potassium ?? 0) * factor;
    total.calcium = (total.calcium ?? 0) + (nf.calcium ?? 0) * factor;
    total.iron = (total.iron ?? 0) + (nf.iron ?? 0) * factor;
    total.vitaminA = (total.vitaminA ?? 0) + (nf.vitaminA ?? 0) * factor;
    total.vitaminD = (total.vitaminD ?? 0) + (nf.vitaminD ?? 0) * factor;
    total.cholesterol = (total.cholesterol ?? 0) + (nf.cholesterol ?? 0) * factor;
  }

  return roundNutrition(total);
}

function divideNutrition(total: NutritionalFacts, servings: number): NutritionalFacts {
  if (servings <= 0) return total;
  return roundNutrition({
    calories: (total.calories ?? 0) / servings,
    fat: (total.fat ?? 0) / servings,
    saturatedFat: (total.saturatedFat ?? 0) / servings,
    carbs: (total.carbs ?? 0) / servings,
    sugars: (total.sugars ?? 0) / servings,
    fiber: (total.fiber ?? 0) / servings,
    protein: (total.protein ?? 0) / servings,
    sodium: (total.sodium ?? 0) / servings,
    potassium: (total.potassium ?? 0) / servings,
    calcium: (total.calcium ?? 0) / servings,
    iron: (total.iron ?? 0) / servings,
    vitaminA: (total.vitaminA ?? 0) / servings,
    vitaminD: (total.vitaminD ?? 0) / servings,
    cholesterol: (total.cholesterol ?? 0) / servings,
  });
}

function roundNutrition(nf: NutritionalFacts): NutritionalFacts {
  const round = (v: number | undefined) => (v !== undefined ? Math.round(v * 10) / 10 : undefined);
  return {
    calories: round(nf.calories),
    fat: round(nf.fat),
    saturatedFat: round(nf.saturatedFat),
    carbs: round(nf.carbs),
    sugars: round(nf.sugars),
    fiber: round(nf.fiber),
    protein: round(nf.protein),
    sodium: round(nf.sodium),
    potassium: round(nf.potassium),
    calcium: round(nf.calcium),
    iron: round(nf.iron),
    vitaminA: round(nf.vitaminA),
    vitaminD: round(nf.vitaminD),
    cholesterol: round(nf.cholesterol),
  };
}

function formatRecipe(recipe: RecipeWithRelations): RecipeResponse {
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    servingUnit: recipe.servingUnit,
    servingWeightGrams: recipe.servingWeightGrams,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    imageUrl: recipe.imageUrl,
    source: recipe.source,
    createdBy: recipe.createdBy.name,
    createdAt: recipe.createdAt.toISOString(),
  };
}
