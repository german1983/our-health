import { prisma } from '../../lib/prisma.js';
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

export async function getRecipes(householdId: string): Promise<RecipeResponse[]> {
  const recipes = await prisma.recipe.findMany({
    where: { householdId },
    include: { createdBy: true },
    orderBy: { createdAt: 'desc' },
  });

  return recipes.map(formatRecipe);
}

export async function getRecipe(id: string, householdId: string): Promise<RecipeDetailResponse> {
  const recipe = await prisma.recipe.findFirst({
    where: { id, householdId },
    include: {
      createdBy: true,
      ingredients: { include: { product: true } },
    },
  });

  if (!recipe) throw new NotFoundError('Recipe');

  const ingredients = recipe.ingredients.map((ing) => ({
    id: ing.id,
    productId: ing.productId,
    productName: ing.product.name,
    quantity: ing.quantity,
    unit: ing.unit,
    notes: ing.notes,
    nutritionalFacts: ing.product.nutritionalFacts as NutritionalFacts | null,
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

export async function createRecipe(input: CreateRecipeInput, householdId: string, userId: string): Promise<RecipeDetailResponse> {
  const recipe = await prisma.recipe.create({
    data: {
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
      ingredients: {
        create: input.ingredients.map((ing) => ({
          productId: ing.productId,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes,
        })),
      },
    },
    include: {
      createdBy: true,
      ingredients: { include: { product: true } },
    },
  });

  const ingredients = recipe.ingredients.map((ing) => ({
    id: ing.id,
    productId: ing.productId,
    productName: ing.product.name,
    quantity: ing.quantity,
    unit: ing.unit,
    notes: ing.notes,
    nutritionalFacts: ing.product.nutritionalFacts as NutritionalFacts | null,
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

export async function updateRecipe(
  id: string,
  input: UpdateRecipeInput,
  householdId: string,
): Promise<RecipeDetailResponse> {
  const existing = await prisma.recipe.findFirst({ where: { id, householdId } });
  if (!existing) throw new NotFoundError('Recipe');

  // If ingredients are provided, replace them all
  if (input.ingredients) {
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });
    await prisma.recipeIngredient.createMany({
      data: input.ingredients.map((ing) => ({
        recipeId: id,
        productId: ing.productId,
        quantity: ing.quantity,
        unit: ing.unit,
        notes: ing.notes,
      })),
    });
  }

  const { ingredients: _, ...recipeData } = input;
  const recipe = await prisma.recipe.update({
    where: { id },
    data: recipeData,
    include: {
      createdBy: true,
      ingredients: { include: { product: true } },
    },
  });

  const formattedIngredients = recipe.ingredients.map((ing) => ({
    id: ing.id,
    productId: ing.productId,
    productName: ing.product.name,
    quantity: ing.quantity,
    unit: ing.unit,
    notes: ing.notes,
    nutritionalFacts: ing.product.nutritionalFacts as NutritionalFacts | null,
    nutritionBaseAmount: ing.product.nutritionBaseAmount,
    nutritionBaseUnit: ing.product.nutritionBaseUnit,
  }));

  const totalNutrition = calculateTotalNutrition(formattedIngredients);
  const perServingNutrition = divideNutrition(totalNutrition, recipe.servings);

  return {
    ...formatRecipe(recipe),
    ingredients: formattedIngredients,
    totalNutrition,
    perServingNutrition,
  };
}

export async function deleteRecipe(id: string, householdId: string): Promise<void> {
  const recipe = await prisma.recipe.findFirst({ where: { id, householdId } });
  if (!recipe) throw new NotFoundError('Recipe');
  await prisma.recipe.delete({ where: { id } });
}

export async function getSuggestions(householdId: string): Promise<RecipeSuggestionResponse[]> {
  // Get current inventory (products with quantity > 0)
  const inventoryItems = await prisma.storageItem.findMany({
    where: {
      storageSpace: { householdId },
      quantity: { gt: 0 },
    },
    select: { productId: true },
  });

  const inventoryProductIds = new Set(inventoryItems.map((i) => i.productId));

  // Get all recipes with their ingredients
  const recipes = await prisma.recipe.findMany({
    where: { householdId },
    include: {
      createdBy: true,
      ingredients: { include: { product: true } },
    },
  });

  const suggestions: RecipeSuggestionResponse[] = recipes.map((recipe) => {
    const totalIngredients = recipe.ingredients.length;
    const available = recipe.ingredients.filter((ing) => inventoryProductIds.has(ing.productId));
    const missing = recipe.ingredients
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

  // Sort: 100% match first, then by score descending
  return suggestions.sort((a, b) => b.matchScore - a.matchScore);
}

// ==================== Nutrition Helpers ====================

function calculateTotalNutrition(
  ingredients: { quantity: number; unit: string; nutritionalFacts: NutritionalFacts | null; nutritionBaseAmount?: number; nutritionBaseUnit?: string }[],
): NutritionalFacts {
  const total: NutritionalFacts = {
    calories: 0,
    fat: 0,
    saturatedFat: 0,
    carbs: 0,
    sugars: 0,
    fiber: 0,
    protein: 0,
    salt: 0,
  };

  for (const ing of ingredients) {
    if (!ing.nutritionalFacts) continue;
    const baseAmount = ing.nutritionBaseAmount || 100;
    const baseUnit = ing.nutritionBaseUnit || 'g';

    // Try to convert ingredient unit to product's base unit
    let quantityInBaseUnit: number;
    if (areUnitsCompatible(ing.unit, baseUnit)) {
      quantityInBaseUnit = convertUnit(ing.quantity, ing.unit, baseUnit);
    } else {
      // Incompatible units — treat quantity as base unit (best effort)
      quantityInBaseUnit = ing.quantity;
    }

    const factor = quantityInBaseUnit / baseAmount;
    const nf = ing.nutritionalFacts;
    total.calories = (total.calories ?? 0) + (nf.calories ?? 0) * factor;
    total.fat = (total.fat ?? 0) + (nf.fat ?? 0) * factor;
    total.saturatedFat = (total.saturatedFat ?? 0) + (nf.saturatedFat ?? 0) * factor;
    total.carbs = (total.carbs ?? 0) + (nf.carbs ?? 0) * factor;
    total.sugars = (total.sugars ?? 0) + (nf.sugars ?? 0) * factor;
    total.fiber = (total.fiber ?? 0) + (nf.fiber ?? 0) * factor;
    total.protein = (total.protein ?? 0) + (nf.protein ?? 0) * factor;
    total.salt = (total.salt ?? 0) + (nf.salt ?? 0) * factor;
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
    salt: (total.salt ?? 0) / servings,
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
    salt: round(nf.salt),
  };
}

function formatRecipe(recipe: {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  servingUnit: string | null;
  servingWeightGrams: number | null;
  prepTime: number | null;
  cookTime: number | null;
  imageUrl: string | null;
  source: string;
  createdById: string;
  createdBy: { name: string };
  createdAt: Date;
}): RecipeResponse {
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
    source: recipe.source as 'USER' | 'EXTERNAL',
    createdBy: recipe.createdBy.name,
    createdAt: recipe.createdAt.toISOString(),
  };
}
