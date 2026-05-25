import { and, eq, gt, desc, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  products,
  productPresentations,
  productServingUnits,
  recipePreparations,
  recipes,
  recipeIngredients,
  storageItems,
  storageSpaces,
  users,
} from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import {
  areUnitsCompatible,
  convertUnit,
  productAwareConvert,
  UNITS,
  type ProductCustomUnit,
} from '@personal-budget/shared';
import type {
  CreateRecipeInput,
  UpdateRecipeInput,
  NutritionalFacts,
  PrepareRecipeInput,
  RecipeAvailabilityResponse,
  RecipeIngredientAvailability,
  RecipePreparationResponse,
  RecipeResponse,
  RecipeDetailResponse,
  RecipeSuggestionResponse,
} from '@personal-budget/shared';

type RecipeWithRelations = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  externalUrl: string | null;
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
    with: {
      createdBy: true,
      ingredients: { with: { product: true } },
    },
    orderBy: desc(recipes.createdAt),
  });
  return result.map((r) => {
    const ings = (r.ingredients ?? []).map((ing) => ({
      quantity: ing.quantity,
      unit: ing.unit,
      nutritionalFacts: ing.product.nutritionalFacts,
      nutritionBaseAmount: ing.product.nutritionBaseAmount,
      nutritionBaseUnit: ing.product.nutritionBaseUnit,
    }));
    return formatRecipe(r, { totalNutrition: calculateTotalNutrition(ings) });
  });
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
  const base = formatRecipe(recipe, { totalNutrition });

  return {
    ...base,
    ingredients,
    totalNutrition,
    perServingNutrition,
    per100gNutrition: per100gNutrition(totalNutrition, base.totalWeightGrams),
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
        instructions: input.instructions,
        externalUrl: input.externalUrl,
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

    const nutritionInputs = ings.map((ing) => ({
      quantity: ing.quantity,
      unit: ing.unit,
      nutritionalFacts: ing.product.nutritionalFacts,
      nutritionBaseAmount: ing.product.nutritionBaseAmount,
      nutritionBaseUnit: ing.product.nutritionBaseUnit,
    }));

    return {
      ...formatRecipe(recipe, { totalNutrition: calculateTotalNutrition(nutritionInputs) }),
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
    transFat: 0,
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
    total.transFat = (total.transFat ?? 0) + (nf.transFat ?? 0) * factor;
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
    transFat: (total.transFat ?? 0) / servings,
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
    transFat: round(nf.transFat),
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

function formatRecipe(
  recipe: RecipeWithRelations,
  extras?: { totalNutrition?: NutritionalFacts },
): RecipeResponse {
  const totalWeightGrams =
    recipe.servingWeightGrams != null && recipe.servings > 0
      ? recipe.servings * recipe.servingWeightGrams
      : null;
  const totalCalories = extras?.totalNutrition?.calories ?? null;
  const caloriesPer100g =
    totalWeightGrams && totalWeightGrams > 0 && totalCalories != null
      ? Math.round((totalCalories * 100) / totalWeightGrams * 10) / 10
      : null;
  const caloriesPerServing =
    recipe.servings > 0 && totalCalories != null
      ? Math.round((totalCalories / recipe.servings) * 10) / 10
      : null;
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    instructions: recipe.instructions,
    externalUrl: recipe.externalUrl,
    servings: recipe.servings,
    servingUnit: recipe.servingUnit,
    servingWeightGrams: recipe.servingWeightGrams,
    totalWeightGrams,
    caloriesPer100g,
    caloriesPerServing,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    imageUrl: recipe.imageUrl,
    source: recipe.source,
    createdBy: recipe.createdBy.name,
    createdAt: recipe.createdAt.toISOString(),
  };
}

function per100gNutrition(
  total: NutritionalFacts,
  totalWeightGrams: number | null,
): NutritionalFacts | null {
  if (!totalWeightGrams || totalWeightGrams <= 0) return null;
  return divideNutrition(total, totalWeightGrams / 100);
}

// ==================== Availability ====================

/**
 * Try to express `qty` of `fromUnit` in `toUnit`, optionally using the
 * product's custom serving units when the physical units library can't
 * make the conversion alone. Returns null when no path exists.
 */
/** Thin wrapper around productAwareConvert that keeps the call sites tidy. */
function tryConvert(
  qty: number,
  fromUnit: string,
  toUnit: string,
  productBaseUnit: string,
  customUnits: ProductCustomUnit[],
): number | null {
  return productAwareConvert(qty, fromUnit, toUnit, { baseUnit: productBaseUnit, customUnits });
}

export async function getRecipeAvailability(
  recipeId: string,
  householdId: string,
): Promise<RecipeAvailabilityResponse> {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)),
    with: {
      ingredients: {
        with: { product: true },
      },
    },
  });
  if (!recipe) throw new NotFoundError('Recipe');

  const productIds = recipe.ingredients.map((i) => i.productId);
  if (productIds.length === 0) {
    return { recipeId, canCook: true, matchScore: 1, ingredients: [] };
  }

  // One query for all storage rows of any ingredient of this recipe.
  const storageRows = await db
    .select({
      productId: storageItems.productId,
      quantity: storageItems.quantity,
      unit: storageItems.unit,
    })
    .from(storageItems)
    .innerJoin(storageSpaces, eq(storageSpaces.id, storageItems.storageSpaceId))
    .where(
      and(eq(storageSpaces.householdId, householdId), inArray(storageItems.productId, productIds)),
    );

  // One query for all custom serving units across these products.
  const servingRows = await db
    .select({
      productId: productServingUnits.productId,
      name: productServingUnits.name,
      baseUnitEquivalent: productServingUnits.baseUnitEquivalent,
      targetUnit: productServingUnits.targetUnit,
    })
    .from(productServingUnits)
    .where(inArray(productServingUnits.productId, productIds));

  const storageByProduct = new Map<string, { quantity: number; unit: string }[]>();
  for (const row of storageRows) {
    const list = storageByProduct.get(row.productId);
    if (list) list.push({ quantity: row.quantity, unit: row.unit });
    else storageByProduct.set(row.productId, [{ quantity: row.quantity, unit: row.unit }]);
  }

  const customByProduct = new Map<string, ProductCustomUnit[]>();
  for (const row of servingRows) {
    const list = customByProduct.get(row.productId);
    if (list) list.push({ name: row.name, baseUnitEquivalent: row.baseUnitEquivalent });
    else
      customByProduct.set(row.productId, [
        { name: row.name, baseUnitEquivalent: row.baseUnitEquivalent },
      ]);
  }

  const out: RecipeIngredientAvailability[] = [];
  let sufficientCount = 0;

  for (const ing of recipe.ingredients) {
    const baseUnit = ing.product?.nutritionBaseUnit ?? ing.unit;
    const customUnits = customByProduct.get(ing.productId) ?? [];

    // Canonical = the ingredient's unit if it's a known physical or custom unit;
    // otherwise fall back to the recipe's stored unit.
    const canonicalUnit = ing.unit;

    let have = 0;
    let unconvertible = 0;
    for (const row of storageByProduct.get(ing.productId) ?? []) {
      const converted = tryConvert(row.quantity, row.unit, canonicalUnit, baseUnit, customUnits);
      if (converted == null) unconvertible++;
      else have += converted;
    }

    // Any storage row we couldn't convert means we can't trust the compare.
    const status: RecipeIngredientAvailability['status'] =
      unconvertible > 0 && have < ing.quantity
        ? 'unknown'
        : have >= ing.quantity
          ? 'sufficient'
          : 'short';
    if (status === 'sufficient') sufficientCount++;

    out.push({
      ingredientId: ing.id,
      productId: ing.productId,
      productName: ing.product?.name ?? '(unknown)',
      needed: ing.quantity,
      neededUnit: ing.unit,
      have,
      canonicalUnit,
      unconvertible,
      status,
      missing: status === 'short' ? Math.max(0, ing.quantity - have) : 0,
    });
  }

  return {
    recipeId,
    canCook: sufficientCount === recipe.ingredients.length,
    matchScore: recipe.ingredients.length === 0 ? 1 : sufficientCount / recipe.ingredients.length,
    ingredients: out,
  };
}

/**
 * Bulk version: availability for every recipe in the household, computed in
 * one pass over storage + serving-units. Used by the recipe list to badge
 * each row without N+1 queries.
 */
export async function getAllRecipesAvailability(
  householdId: string,
): Promise<Record<string, RecipeAvailabilityResponse>> {
  const allRecipes = await db.query.recipes.findMany({
    where: eq(recipes.householdId, householdId),
    with: { ingredients: { with: { product: true } } },
  });
  if (allRecipes.length === 0) return {};

  const allProductIds = Array.from(
    new Set(allRecipes.flatMap((r) => r.ingredients.map((i) => i.productId))),
  );

  const storageRows = await db
    .select({
      productId: storageItems.productId,
      quantity: storageItems.quantity,
      unit: storageItems.unit,
    })
    .from(storageItems)
    .innerJoin(storageSpaces, eq(storageSpaces.id, storageItems.storageSpaceId))
    .where(
      and(eq(storageSpaces.householdId, householdId), inArray(storageItems.productId, allProductIds)),
    );

  const servingRows = await db
    .select({
      productId: productServingUnits.productId,
      name: productServingUnits.name,
      baseUnitEquivalent: productServingUnits.baseUnitEquivalent,
      targetUnit: productServingUnits.targetUnit,
    })
    .from(productServingUnits)
    .where(inArray(productServingUnits.productId, allProductIds));

  const storageByProduct = new Map<string, { quantity: number; unit: string }[]>();
  for (const row of storageRows) {
    const list = storageByProduct.get(row.productId);
    if (list) list.push({ quantity: row.quantity, unit: row.unit });
    else storageByProduct.set(row.productId, [{ quantity: row.quantity, unit: row.unit }]);
  }
  const customByProduct = new Map<string, ProductCustomUnit[]>();
  for (const row of servingRows) {
    const list = customByProduct.get(row.productId);
    if (list) list.push({ name: row.name, baseUnitEquivalent: row.baseUnitEquivalent });
    else
      customByProduct.set(row.productId, [
        { name: row.name, baseUnitEquivalent: row.baseUnitEquivalent },
      ]);
  }

  const out: Record<string, RecipeAvailabilityResponse> = {};
  for (const recipe of allRecipes) {
    const ingredients: RecipeIngredientAvailability[] = [];
    let sufficientCount = 0;
    for (const ing of recipe.ingredients) {
      const baseUnit = ing.product?.nutritionBaseUnit ?? ing.unit;
      const customUnits = customByProduct.get(ing.productId) ?? [];
      const canonicalUnit = ing.unit;
      let have = 0;
      let unconvertible = 0;
      for (const row of storageByProduct.get(ing.productId) ?? []) {
        const converted = tryConvert(row.quantity, row.unit, canonicalUnit, baseUnit, customUnits);
        if (converted == null) unconvertible++;
        else have += converted;
      }
      const status: RecipeIngredientAvailability['status'] =
        unconvertible > 0 && have < ing.quantity
          ? 'unknown'
          : have >= ing.quantity
            ? 'sufficient'
            : 'short';
      if (status === 'sufficient') sufficientCount++;
      ingredients.push({
        ingredientId: ing.id,
        productId: ing.productId,
        productName: ing.product?.name ?? '(unknown)',
        needed: ing.quantity,
        neededUnit: ing.unit,
        have,
        canonicalUnit,
        unconvertible,
        status,
        missing: status === 'short' ? Math.max(0, ing.quantity - have) : 0,
      });
    }
    out[recipe.id] = {
      recipeId: recipe.id,
      canCook: sufficientCount === recipe.ingredients.length,
      matchScore: recipe.ingredients.length === 0 ? 1 : sufficientCount / recipe.ingredients.length,
      ingredients,
    };
  }
  return out;
}

// ==================== Prepare (consume stock + store leftovers) ====================

export interface ShortageError {
  productId: string;
  productName: string;
  requested: number;
  requestedUnit: string;
  available: number;
}

/**
 * "I just cooked this." Deducts the scaled ingredient requirements from
 * household storage (oldest-expiring lot first, FIFO, never negative), and
 * optionally saves the leftovers as a storage entry tied to a per-recipe
 * companion product.
 */
export async function prepareRecipe(args: {
  recipeId: string;
  householdId: string;
  userId: string;
  input: PrepareRecipeInput;
}): Promise<RecipePreparationResponse> {
  const { recipeId, householdId, userId, input } = args;
  const scale = input.scale > 0 ? input.scale : 1;

  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)),
    with: { ingredients: { with: { product: true } } },
  });
  if (!recipe) throw new NotFoundError('Recipe');

  // Validate storage space (if user asked to save leftovers).
  let storageSpaceId: string | null = null;
  if (input.storageSpaceId) {
    const space = await db.query.storageSpaces.findFirst({
      where: and(eq(storageSpaces.id, input.storageSpaceId), eq(storageSpaces.householdId, householdId)),
    });
    if (!space) throw new NotFoundError('Storage space');
    storageSpaceId = space.id;
  }

  // Per-product custom units, used by the conversion engine when storage rows
  // are in a different unit than the recipe asks for.
  const productIds = recipe.ingredients.map((i) => i.productId);
  const servingRows =
    productIds.length > 0
      ? await db
          .select({
            productId: productServingUnits.productId,
            name: productServingUnits.name,
            baseUnitEquivalent: productServingUnits.baseUnitEquivalent,
            targetUnit: productServingUnits.targetUnit,
          })
          .from(productServingUnits)
          .where(inArray(productServingUnits.productId, productIds))
      : [];
  const customsByProduct = new Map<string, ProductCustomUnit[]>();
  for (const r of servingRows) {
    const list = customsByProduct.get(r.productId);
    if (list) list.push(r);
    else customsByProduct.set(r.productId, [r]);
  }

  // Plan deductions per ingredient without writing yet. Catches shortage
  // up-front so we don't half-consume when the user didn't OK the shortfall.
  interface PlannedDeduction {
    rowId: string;
    /** Quantity to remove in the row's stored unit. */
    deltaInRowUnit: number;
    /** Equivalent contribution in the ingredient's unit (for the response ledger). */
    contributedInIngredientUnit: number;
  }
  interface IngredientPlan {
    ingredientId: string;
    productId: string;
    productName: string;
    requested: number;
    requestedUnit: string;
    deductions: PlannedDeduction[];
    deducted: number;
    shortage: number;
  }

  const plans: IngredientPlan[] = [];
  const shortages: ShortageError[] = [];

  for (const ing of recipe.ingredients) {
    const requested = ing.quantity * scale;
    const requestedUnit = ing.unit;
    const baseUnit = ing.product?.nutritionBaseUnit ?? requestedUnit;
    const customs = customsByProduct.get(ing.productId) ?? [];

    const rows = await db
      .select({
        id: storageItems.id,
        quantity: storageItems.quantity,
        unit: storageItems.unit,
        expiryDate: storageItems.expiryDate,
        addedAt: storageItems.addedAt,
      })
      .from(storageItems)
      .innerJoin(storageSpaces, eq(storageSpaces.id, storageItems.storageSpaceId))
      .where(
        and(eq(storageSpaces.householdId, householdId), eq(storageItems.productId, ing.productId)),
      );

    // Expiry-soonest first (FIFO that minimizes waste); rows without expiry
    // fall to the back; tiebreak on addedAt (oldest first).
    rows.sort((a, b) => {
      const ax = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bx = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ax !== bx) return ax - bx;
      return a.addedAt.getTime() - b.addedAt.getTime();
    });

    let remaining = requested;
    const deductions: PlannedDeduction[] = [];

    for (const row of rows) {
      if (remaining <= 1e-9) break;
      // How much does this whole row provide, in the ingredient's unit?
      const fullContribution = productAwareConvert(row.quantity, row.unit, requestedUnit, {
        baseUnit,
        customUnits: customs,
      });
      if (fullContribution == null || fullContribution <= 0) continue;

      if (fullContribution <= remaining + 1e-9) {
        // Consume entire row.
        deductions.push({
          rowId: row.id,
          deltaInRowUnit: row.quantity,
          contributedInIngredientUnit: fullContribution,
        });
        remaining -= fullContribution;
      } else {
        // Consume partial — proportional to the conversion.
        const ratio = remaining / fullContribution;
        deductions.push({
          rowId: row.id,
          deltaInRowUnit: row.quantity * ratio,
          contributedInIngredientUnit: remaining,
        });
        remaining = 0;
      }
    }

    const deducted = requested - Math.max(0, remaining);
    const shortage = Math.max(0, remaining);
    if (shortage > 1e-6) {
      shortages.push({
        productId: ing.productId,
        productName: ing.product?.name ?? '(unknown)',
        requested,
        requestedUnit,
        available: deducted,
      });
    }

    plans.push({
      ingredientId: ing.id,
      productId: ing.productId,
      productName: ing.product?.name ?? '(unknown)',
      requested,
      requestedUnit,
      deductions,
      deducted,
      shortage,
    });
  }

  if (shortages.length > 0 && !input.allowShortage) {
    const err = new ConflictError('Insufficient stock for one or more ingredients');
    (err as ConflictError & { shortages: ShortageError[] }).shortages = shortages;
    throw err;
  }

  // Apply the plan inside one transaction. Storage rows that hit zero are
  // deleted; partial rows get their quantity updated. If leftovers are being
  // stored, lazily ensure recipe.resultProductId points at a companion
  // product and add a storage_items row for the cooked dish.
  const persisted = await db.transaction(async (tx) => {
    for (const plan of plans) {
      for (const d of plan.deductions) {
        const [row] = await tx
          .select({ id: storageItems.id, quantity: storageItems.quantity })
          .from(storageItems)
          .where(eq(storageItems.id, d.rowId));
        if (!row) continue;
        const next = Math.max(0, row.quantity - d.deltaInRowUnit);
        if (next <= 1e-9) {
          await tx.delete(storageItems).where(eq(storageItems.id, row.id));
        } else {
          await tx
            .update(storageItems)
            .set({ quantity: next })
            .where(eq(storageItems.id, row.id));
        }
      }
    }

    let storedItemId: string | null = null;
    if (storageSpaceId) {
      // Resolve (and lazily create) the recipe's companion product. Reused on
      // subsequent preps so leftovers from the same recipe stack together.
      let resultProductId = recipe.resultProductId;
      if (!resultProductId) {
        const [newProduct] = await tx
          .insert(products)
          .values({
            name: recipe.name,
            // No category / no nutrition facts yet — those can be filled in
            // later. Companion products track the recipe via resultProductId.
            nutritionBaseAmount: recipe.servingWeightGrams ?? 100,
            nutritionBaseUnit: 'g',
          })
          .returning({ id: products.id });
        // Default "Default" 1-unit presentation to keep Model B invariants
        // satisfied (every product has at least one presentation).
        await tx.insert(productPresentations).values({
          productId: newProduct.id,
          name: 'Default',
          amount: 1,
          unit: 'unit',
          isDefault: true,
        });
        await tx
          .update(recipes)
          .set({ resultProductId: newProduct.id })
          .where(eq(recipes.id, recipe.id));
        resultProductId = newProduct.id;
      }

      const storedQuantity = input.storedQuantity ?? scale * recipe.servings;
      const storedUnit = input.storedUnit ?? 'serving';

      const [storedItem] = await tx
        .insert(storageItems)
        .values({
          storageSpaceId,
          productId: resultProductId,
          quantity: storedQuantity,
          unit: storedUnit,
          addedById: userId,
          expiryDate: input.storedExpiryDate ? new Date(input.storedExpiryDate) : null,
        })
        .returning({ id: storageItems.id });
      storedItemId = storedItem.id;
    }

    const [prep] = await tx
      .insert(recipePreparations)
      .values({
        recipeId: recipe.id,
        householdId,
        preparedById: userId,
        scale,
        allowedShortage: shortages.length > 0,
        notes: input.notes,
        storedItemId,
      })
      .returning();

    return prep;
  });

  const preparedBy = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true },
  });

  return {
    id: persisted.id,
    recipeId: persisted.recipeId,
    preparedById: persisted.preparedById,
    preparedByName: preparedBy?.name ?? '(unknown)',
    scale: persisted.scale,
    allowedShortage: persisted.allowedShortage,
    notes: persisted.notes,
    storedItemId: persisted.storedItemId,
    preparedAt: persisted.preparedAt.toISOString(),
    consumption: plans.map((p) => ({
      ingredientId: p.ingredientId,
      productId: p.productId,
      productName: p.productName,
      requested: p.requested,
      requestedUnit: p.requestedUnit,
      deducted: p.deducted,
      shortage: p.shortage,
    })),
  };
}
