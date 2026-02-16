import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../lib/errors.js';
import type {
  NutritionalFacts,
  CreateIntakeEntryInput,
  UpdateIntakeEntryInput,
  CreateServingUnitInput,
  UpdateServingUnitInput,
  MealSlot,
  ServingUnitResponse,
  IntakeEntryResponse,
  MealGroup,
  DailyLogResponse,
  IntakeSummaryResponse,
} from '@personal-budget/shared';

const ALL_MEAL_SLOTS: MealSlot[] = [
  'BREAKFAST',
  'MID_MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
  'EVENING_SNACK',
];

// ==================== Daily Log ====================

export async function getDailyLog(userId: string, date: string): Promise<DailyLogResponse> {
  const dateObj = new Date(date + 'T00:00:00.000Z');

  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: dateObj } },
    include: {
      entries: {
        include: {
          product: true,
          recipe: { include: { ingredients: { include: { product: true } } } },
          servingUnit: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const entries = log?.entries ?? [];
  const formattedEntries = entries.map(formatEntry);

  const meals: MealGroup[] = ALL_MEAL_SLOTS.map((slot) => {
    const slotEntries = formattedEntries.filter((e) => e.mealSlot === slot);
    return {
      mealSlot: slot,
      entries: slotEntries,
      nutrition: sumNutrition(slotEntries.map((e) => e.nutrition)),
    };
  });

  return {
    id: log?.id ?? null,
    date,
    notes: log?.notes ?? null,
    meals,
    totalNutrition: sumNutrition(formattedEntries.map((e) => e.nutrition)),
  };
}

// ==================== Intake Entries ====================

export async function createEntry(userId: string, input: CreateIntakeEntryInput): Promise<IntakeEntryResponse> {
  const dateObj = new Date(input.date + 'T00:00:00.000Z');

  // Upsert daily log
  const log = await prisma.dailyLog.upsert({
    where: { userId_date: { userId, date: dateObj } },
    create: { userId, date: dateObj },
    update: {},
  });

  // Validate serving unit ownership if provided
  if (input.servingUnitId) {
    const unit = await prisma.productServingUnit.findUnique({ where: { id: input.servingUnitId } });
    if (!unit || unit.userId !== userId) throw new NotFoundError('Serving unit');
  }

  const entry = await prisma.intakeEntry.create({
    data: {
      dailyLogId: log.id,
      mealSlot: input.mealSlot,
      productId: input.productId,
      recipeId: input.recipeId,
      quantity: input.quantity,
      servingUnitId: input.servingUnitId,
      notes: input.notes,
    },
    include: {
      product: true,
      recipe: { include: { ingredients: { include: { product: true } } } },
      servingUnit: true,
    },
  });

  return formatEntry(entry);
}

export async function updateEntry(entryId: string, userId: string, input: UpdateIntakeEntryInput): Promise<IntakeEntryResponse> {
  const entry = await prisma.intakeEntry.findUnique({
    where: { id: entryId },
    include: { dailyLog: true },
  });

  if (!entry) throw new NotFoundError('Intake entry');
  if (entry.dailyLog.userId !== userId) throw new ForbiddenError();

  if (input.servingUnitId) {
    const unit = await prisma.productServingUnit.findUnique({ where: { id: input.servingUnitId } });
    if (!unit || unit.userId !== userId) throw new NotFoundError('Serving unit');
  }

  const updated = await prisma.intakeEntry.update({
    where: { id: entryId },
    data: {
      mealSlot: input.mealSlot,
      quantity: input.quantity,
      servingUnitId: input.servingUnitId,
      notes: input.notes,
    },
    include: {
      product: true,
      recipe: { include: { ingredients: { include: { product: true } } } },
      servingUnit: true,
    },
  });

  return formatEntry(updated);
}

export async function deleteEntry(entryId: string, userId: string): Promise<void> {
  const entry = await prisma.intakeEntry.findUnique({
    where: { id: entryId },
    include: { dailyLog: true },
  });

  if (!entry) throw new NotFoundError('Intake entry');
  if (entry.dailyLog.userId !== userId) throw new ForbiddenError();

  await prisma.intakeEntry.delete({ where: { id: entryId } });
}

// ==================== Serving Units ====================

export async function getServingUnits(userId: string, productId: string): Promise<ServingUnitResponse[]> {
  const units = await prisma.productServingUnit.findMany({
    where: { userId, productId },
    orderBy: { name: 'asc' },
  });

  return units.map((u) => ({
    id: u.id,
    productId: u.productId,
    name: u.name,
    gramsEquivalent: u.gramsEquivalent,
  }));
}

export async function createServingUnit(userId: string, input: CreateServingUnitInput): Promise<ServingUnitResponse> {
  const unit = await prisma.productServingUnit.create({
    data: {
      productId: input.productId,
      userId,
      name: input.name,
      gramsEquivalent: input.gramsEquivalent,
    },
  });

  return {
    id: unit.id,
    productId: unit.productId,
    name: unit.name,
    gramsEquivalent: unit.gramsEquivalent,
  };
}

export async function updateServingUnit(id: string, userId: string, input: UpdateServingUnitInput): Promise<ServingUnitResponse> {
  const existing = await prisma.productServingUnit.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Serving unit');
  if (existing.userId !== userId) throw new ForbiddenError();

  const unit = await prisma.productServingUnit.update({
    where: { id },
    data: input,
  });

  return {
    id: unit.id,
    productId: unit.productId,
    name: unit.name,
    gramsEquivalent: unit.gramsEquivalent,
  };
}

export async function deleteServingUnit(id: string, userId: string): Promise<void> {
  const existing = await prisma.productServingUnit.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Serving unit');
  if (existing.userId !== userId) throw new ForbiddenError();

  await prisma.productServingUnit.delete({ where: { id } });
}

// ==================== Summary ====================

export async function getSummary(userId: string, from: string, to: string): Promise<IntakeSummaryResponse[]> {
  const fromDate = new Date(from + 'T00:00:00.000Z');
  const toDate = new Date(to + 'T00:00:00.000Z');

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId,
      date: { gte: fromDate, lte: toDate },
    },
    include: {
      entries: {
        include: {
          product: true,
          recipe: { include: { ingredients: { include: { product: true } } } },
          servingUnit: true,
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  return logs.map((log) => {
    const entries = log.entries.map(formatEntry);
    return {
      date: log.date.toISOString().split('T')[0],
      totalNutrition: sumNutrition(entries.map((e) => e.nutrition)),
    };
  });
}

// ==================== Helpers ====================

function calculateEntryNutrition(entry: {
  product: { nutritionalFacts: unknown; nutritionBaseGrams: number } | null;
  recipe: { servings: number; ingredients: { quantity: number; product: { nutritionalFacts: unknown; nutritionBaseGrams: number } }[] } | null;
  quantity: number;
  servingUnit: { gramsEquivalent: number } | null;
}): { calculatedGrams: number | null; nutrition: NutritionalFacts | null } {
  // Recipe-based entry: quantity = number of servings
  if (entry.recipe) {
    const totalNutrition = calculateRecipeTotalNutrition(entry.recipe.ingredients);
    const perServing = divideNutrition(totalNutrition, entry.recipe.servings);
    return {
      calculatedGrams: null,
      nutrition: multiplyNutrition(perServing, entry.quantity),
    };
  }

  // Product-based entry
  if (entry.product) {
    const nf = entry.product.nutritionalFacts as NutritionalFacts | null;
    if (!nf) return { calculatedGrams: null, nutrition: null };

    const baseGrams = entry.product.nutritionBaseGrams || 100;
    const totalGrams = entry.servingUnit
      ? entry.quantity * entry.servingUnit.gramsEquivalent
      : entry.quantity;

    const factor = totalGrams / baseGrams;
    return {
      calculatedGrams: Math.round(totalGrams * 10) / 10,
      nutrition: roundNutrition({
        calories: (nf.calories ?? 0) * factor,
        fat: (nf.fat ?? 0) * factor,
        saturatedFat: (nf.saturatedFat ?? 0) * factor,
        carbs: (nf.carbs ?? 0) * factor,
        sugars: (nf.sugars ?? 0) * factor,
        fiber: (nf.fiber ?? 0) * factor,
        protein: (nf.protein ?? 0) * factor,
        salt: (nf.salt ?? 0) * factor,
      }),
    };
  }

  return { calculatedGrams: null, nutrition: null };
}

function calculateRecipeTotalNutrition(
  ingredients: { quantity: number; product: { nutritionalFacts: unknown; nutritionBaseGrams: number } }[],
): NutritionalFacts {
  const total: NutritionalFacts = { calories: 0, fat: 0, saturatedFat: 0, carbs: 0, sugars: 0, fiber: 0, protein: 0, salt: 0 };

  for (const ing of ingredients) {
    const nf = ing.product.nutritionalFacts as NutritionalFacts | null;
    if (!nf) continue;
    const baseGrams = ing.product.nutritionBaseGrams || 100;
    const factor = ing.quantity / baseGrams;
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

function divideNutrition(nf: NutritionalFacts, divisor: number): NutritionalFacts {
  if (divisor <= 0) return nf;
  return roundNutrition({
    calories: (nf.calories ?? 0) / divisor,
    fat: (nf.fat ?? 0) / divisor,
    saturatedFat: (nf.saturatedFat ?? 0) / divisor,
    carbs: (nf.carbs ?? 0) / divisor,
    sugars: (nf.sugars ?? 0) / divisor,
    fiber: (nf.fiber ?? 0) / divisor,
    protein: (nf.protein ?? 0) / divisor,
    salt: (nf.salt ?? 0) / divisor,
  });
}

function multiplyNutrition(nf: NutritionalFacts, factor: number): NutritionalFacts {
  return roundNutrition({
    calories: (nf.calories ?? 0) * factor,
    fat: (nf.fat ?? 0) * factor,
    saturatedFat: (nf.saturatedFat ?? 0) * factor,
    carbs: (nf.carbs ?? 0) * factor,
    sugars: (nf.sugars ?? 0) * factor,
    fiber: (nf.fiber ?? 0) * factor,
    protein: (nf.protein ?? 0) * factor,
    salt: (nf.salt ?? 0) * factor,
  });
}

function sumNutrition(items: (NutritionalFacts | null)[]): NutritionalFacts {
  const total: NutritionalFacts = { calories: 0, fat: 0, saturatedFat: 0, carbs: 0, sugars: 0, fiber: 0, protein: 0, salt: 0 };

  for (const nf of items) {
    if (!nf) continue;
    total.calories = (total.calories ?? 0) + (nf.calories ?? 0);
    total.fat = (total.fat ?? 0) + (nf.fat ?? 0);
    total.saturatedFat = (total.saturatedFat ?? 0) + (nf.saturatedFat ?? 0);
    total.carbs = (total.carbs ?? 0) + (nf.carbs ?? 0);
    total.sugars = (total.sugars ?? 0) + (nf.sugars ?? 0);
    total.fiber = (total.fiber ?? 0) + (nf.fiber ?? 0);
    total.protein = (total.protein ?? 0) + (nf.protein ?? 0);
    total.salt = (total.salt ?? 0) + (nf.salt ?? 0);
  }

  return roundNutrition(total);
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

function formatEntry(entry: {
  id: string;
  mealSlot: string;
  productId: string | null;
  product: { name: string; nutritionalFacts: unknown; nutritionBaseGrams: number } | null;
  recipeId: string | null;
  recipe: { name: string; servings: number; ingredients: { quantity: number; product: { nutritionalFacts: unknown; nutritionBaseGrams: number } }[] } | null;
  quantity: number;
  servingUnitId: string | null;
  servingUnit: { name: string; gramsEquivalent: number } | null;
  notes: string | null;
  sortOrder: number;
}): IntakeEntryResponse {
  const { calculatedGrams, nutrition } = calculateEntryNutrition(entry);

  return {
    id: entry.id,
    mealSlot: entry.mealSlot as MealSlot,
    productId: entry.productId,
    productName: entry.product?.name ?? null,
    recipeId: entry.recipeId,
    recipeName: entry.recipe?.name ?? null,
    quantity: entry.quantity,
    servingUnitId: entry.servingUnitId,
    servingUnitName: entry.servingUnit?.name ?? null,
    calculatedGrams,
    nutrition,
    notes: entry.notes,
    sortOrder: entry.sortOrder,
  };
}
