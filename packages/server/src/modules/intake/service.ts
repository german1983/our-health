import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { dailyLogs, intakeEntries, productServingUnits } from '../../db/schema.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { areUnitsCompatible, convertUnit } from '@personal-budget/shared';
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

const entryRelations = {
  product: true,
  recipe: { with: { ingredients: { with: { product: true } } } },
  servingUnit: true,
} as const;

type EntryWithRelations = {
  id: string;
  mealSlot: MealSlot;
  productId: string | null;
  product: {
    name: string;
    nutritionalFacts: NutritionalFacts | null;
    nutritionBaseAmount: number;
    nutritionBaseUnit: string;
  } | null;
  recipeId: string | null;
  recipe: {
    name: string;
    servings: number;
    ingredients: {
      quantity: number;
      unit: string;
      product: {
        nutritionalFacts: NutritionalFacts | null;
        nutritionBaseAmount: number;
        nutritionBaseUnit: string;
      };
    }[];
  } | null;
  quantity: number;
  servingUnitId: string | null;
  servingUnit: { name: string; baseUnitEquivalent: number } | null;
  unit: string | null;
  notes: string | null;
  sortOrder: number;
};

// ==================== Daily Log ====================

export async function getDailyLog(userId: string, dateStr: string): Promise<DailyLogResponse> {
  const dateObj = new Date(dateStr + 'T00:00:00.000Z');

  const log = await db.query.dailyLogs.findFirst({
    where: and(eq(dailyLogs.userId, userId), eq(dailyLogs.date, dateObj)),
    with: {
      entries: {
        with: entryRelations,
        orderBy: asc(intakeEntries.sortOrder),
      },
    },
  });

  const entries = log?.entries ?? [];
  const formattedEntries = entries.map((e) => formatEntry(e as unknown as EntryWithRelations));

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
    date: dateStr,
    notes: log?.notes ?? null,
    meals,
    totalNutrition: sumNutrition(formattedEntries.map((e) => e.nutrition)),
  };
}

// ==================== Intake Entries ====================

export async function createEntry(userId: string, input: CreateIntakeEntryInput): Promise<IntakeEntryResponse> {
  const dateObj = new Date(input.date + 'T00:00:00.000Z');

  // Upsert daily log
  const [log] = await db
    .insert(dailyLogs)
    .values({ userId, date: dateObj })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.date],
      set: { userId },
    })
    .returning({ id: dailyLogs.id });

  if (input.servingUnitId) {
    const unit = await db.query.productServingUnits.findFirst({
      where: eq(productServingUnits.id, input.servingUnitId),
    });
    if (!unit || unit.userId !== userId) throw new NotFoundError('Serving unit');
  }

  const [inserted] = await db
    .insert(intakeEntries)
    .values({
      dailyLogId: log.id,
      mealSlot: input.mealSlot,
      productId: input.productId,
      recipeId: input.recipeId,
      quantity: input.quantity,
      servingUnitId: input.servingUnitId,
      unit: input.unit,
      notes: input.notes,
    })
    .returning({ id: intakeEntries.id });

  const entry = await db.query.intakeEntries.findFirst({
    where: eq(intakeEntries.id, inserted.id),
    with: entryRelations,
  });
  return formatEntry(entry as unknown as EntryWithRelations);
}

export async function updateEntry(
  entryId: string,
  userId: string,
  input: UpdateIntakeEntryInput,
): Promise<IntakeEntryResponse> {
  const existing = await db.query.intakeEntries.findFirst({
    where: eq(intakeEntries.id, entryId),
    with: { dailyLog: true },
  });
  if (!existing) throw new NotFoundError('Intake entry');
  if (existing.dailyLog.userId !== userId) throw new ForbiddenError();

  if (input.servingUnitId) {
    const unit = await db.query.productServingUnits.findFirst({
      where: eq(productServingUnits.id, input.servingUnitId),
    });
    if (!unit || unit.userId !== userId) throw new NotFoundError('Serving unit');
  }

  // servingUnitId and unit are mutually exclusive — setting one clears the other.
  const data: Record<string, unknown> = {
    mealSlot: input.mealSlot,
    quantity: input.quantity,
    notes: input.notes,
  };
  if (input.servingUnitId !== undefined) {
    data.servingUnitId = input.servingUnitId;
    if (input.servingUnitId) data.unit = null;
  }
  if (input.unit !== undefined) {
    data.unit = input.unit;
    if (input.unit) data.servingUnitId = null;
  }

  await db.update(intakeEntries).set(data).where(eq(intakeEntries.id, entryId));

  const entry = await db.query.intakeEntries.findFirst({
    where: eq(intakeEntries.id, entryId),
    with: entryRelations,
  });
  return formatEntry(entry as unknown as EntryWithRelations);
}

export async function deleteEntry(entryId: string, userId: string): Promise<void> {
  const existing = await db.query.intakeEntries.findFirst({
    where: eq(intakeEntries.id, entryId),
    with: { dailyLog: true },
  });
  if (!existing) throw new NotFoundError('Intake entry');
  if (existing.dailyLog.userId !== userId) throw new ForbiddenError();

  await db.delete(intakeEntries).where(eq(intakeEntries.id, entryId));
}

// ==================== Serving Units ====================

export async function getServingUnits(userId: string, productId: string): Promise<ServingUnitResponse[]> {
  const units = await db.query.productServingUnits.findMany({
    where: and(eq(productServingUnits.userId, userId), eq(productServingUnits.productId, productId)),
    orderBy: asc(productServingUnits.name),
  });
  return units.map((u) => ({
    id: u.id,
    productId: u.productId,
    name: u.name,
    baseUnitEquivalent: u.baseUnitEquivalent,
  }));
}

export async function createServingUnit(
  userId: string,
  input: CreateServingUnitInput,
): Promise<ServingUnitResponse> {
  const [unit] = await db
    .insert(productServingUnits)
    .values({
      productId: input.productId,
      userId,
      name: input.name,
      baseUnitEquivalent: input.baseUnitEquivalent,
    })
    .returning();
  return {
    id: unit.id,
    productId: unit.productId,
    name: unit.name,
    baseUnitEquivalent: unit.baseUnitEquivalent,
  };
}

export async function updateServingUnit(
  id: string,
  userId: string,
  input: UpdateServingUnitInput,
): Promise<ServingUnitResponse> {
  const existing = await db.query.productServingUnits.findFirst({
    where: eq(productServingUnits.id, id),
  });
  if (!existing) throw new NotFoundError('Serving unit');
  if (existing.userId !== userId) throw new ForbiddenError();

  const [unit] = await db
    .update(productServingUnits)
    .set(input)
    .where(eq(productServingUnits.id, id))
    .returning();
  return {
    id: unit.id,
    productId: unit.productId,
    name: unit.name,
    baseUnitEquivalent: unit.baseUnitEquivalent,
  };
}

export async function deleteServingUnit(id: string, userId: string): Promise<void> {
  const existing = await db.query.productServingUnits.findFirst({
    where: eq(productServingUnits.id, id),
  });
  if (!existing) throw new NotFoundError('Serving unit');
  if (existing.userId !== userId) throw new ForbiddenError();
  await db.delete(productServingUnits).where(eq(productServingUnits.id, id));
}

// ==================== Summary ====================

export async function getSummary(
  userId: string,
  from: string,
  to: string,
): Promise<IntakeSummaryResponse[]> {
  const fromDate = new Date(from + 'T00:00:00.000Z');
  const toDate = new Date(to + 'T00:00:00.000Z');

  const logs = await db.query.dailyLogs.findMany({
    where: and(eq(dailyLogs.userId, userId), gte(dailyLogs.date, fromDate), lte(dailyLogs.date, toDate)),
    with: { entries: { with: entryRelations } },
    orderBy: asc(dailyLogs.date),
  });

  return logs.map((log) => {
    const entries = log.entries.map((e) => formatEntry(e as unknown as EntryWithRelations));
    return {
      date: log.date.toISOString().split('T')[0],
      totalNutrition: sumNutrition(entries.map((e) => e.nutrition)),
    };
  });
}

// ==================== Helpers ====================

function calculateEntryNutrition(entry: EntryWithRelations): {
  calculatedAmount: number | null;
  calculatedUnit: string | null;
  nutrition: NutritionalFacts | null;
} {
  // Recipe-based entry: quantity = number of servings
  if (entry.recipe) {
    const totalNutrition = calculateRecipeTotalNutrition(entry.recipe.ingredients);
    const perServing = divideNutrition(totalNutrition, entry.recipe.servings);
    return {
      calculatedAmount: null,
      calculatedUnit: null,
      nutrition: multiplyNutrition(perServing, entry.quantity),
    };
  }

  if (entry.product) {
    const nf = entry.product.nutritionalFacts;
    if (!nf) return { calculatedAmount: null, calculatedUnit: null, nutrition: null };

    const baseAmount = entry.product.nutritionBaseAmount || 100;
    const baseUnit = entry.product.nutritionBaseUnit || 'g';

    // Three cases for converting the entry's quantity into the product's base unit:
    let totalInBaseUnit: number;
    if (entry.servingUnit) {
      // Custom serving unit — its baseUnitEquivalent is already in the product's base unit.
      totalInBaseUnit = entry.quantity * entry.servingUnit.baseUnitEquivalent;
    } else if (entry.unit && areUnitsCompatible(entry.unit, baseUnit)) {
      // Standard unit in the same family — convert via the units table.
      totalInBaseUnit = convertUnit(entry.quantity, entry.unit, baseUnit);
    } else {
      // No unit, or an incompatible one — assume quantity is already in the base unit.
      totalInBaseUnit = entry.quantity;
    }

    const factor = totalInBaseUnit / baseAmount;
    return {
      calculatedAmount: Math.round(totalInBaseUnit * 10) / 10,
      calculatedUnit: baseUnit,
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

  return { calculatedAmount: null, calculatedUnit: null, nutrition: null };
}

function calculateRecipeTotalNutrition(
  ingredients: {
    quantity: number;
    unit: string;
    product: {
      nutritionalFacts: NutritionalFacts | null;
      nutritionBaseAmount: number;
      nutritionBaseUnit: string;
    };
  }[],
): NutritionalFacts {
  const total: NutritionalFacts = { calories: 0, fat: 0, saturatedFat: 0, carbs: 0, sugars: 0, fiber: 0, protein: 0, salt: 0 };
  for (const ing of ingredients) {
    const nf = ing.product.nutritionalFacts;
    if (!nf) continue;
    const baseAmount = ing.product.nutritionBaseAmount || 100;
    const baseUnit = ing.product.nutritionBaseUnit || 'g';

    // Convert the ingredient's quantity into the product's base unit.
    let qtyInBaseUnit: number;
    if (areUnitsCompatible(ing.unit, baseUnit)) {
      qtyInBaseUnit = convertUnit(ing.quantity, ing.unit, baseUnit);
    } else {
      // Incompatible (e.g. a volume recipe ingredient against a mass-based product)
      // — best effort: treat ingredient quantity as base units.
      qtyInBaseUnit = ing.quantity;
    }

    const factor = qtyInBaseUnit / baseAmount;
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

function formatEntry(entry: EntryWithRelations): IntakeEntryResponse {
  const { calculatedAmount, calculatedUnit, nutrition } = calculateEntryNutrition(entry);
  return {
    id: entry.id,
    mealSlot: entry.mealSlot,
    productId: entry.productId,
    productName: entry.product?.name ?? null,
    recipeId: entry.recipeId,
    recipeName: entry.recipe?.name ?? null,
    quantity: entry.quantity,
    servingUnitId: entry.servingUnitId,
    servingUnitName: entry.servingUnit?.name ?? null,
    unit: entry.unit,
    calculatedAmount,
    calculatedUnit,
    nutrition,
    notes: entry.notes,
    sortOrder: entry.sortOrder,
  };
}
