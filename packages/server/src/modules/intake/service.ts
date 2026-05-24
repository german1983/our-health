import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { dailyLogs, intakeEntries, productServingUnits } from '../../db/schema.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { areUnitsCompatible, convertUnit, productAwareConvert, type ProductCustomUnit } from '@personal-budget/shared';
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
  // Pull the product *with* its full custom-unit list so the conversion
  // engine can chain edges when the serving unit's targetUnit isn't the
  // product's base unit (e.g. cross-family bridges).
  product: { with: { productServingUnits: true } },
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
    productServingUnits?: { name: string; baseUnitEquivalent: number; targetUnit: string | null }[];
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
  servingUnit: { name: string; baseUnitEquivalent: number; targetUnit: string | null } | null;
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
    if (!unit) throw new NotFoundError('Serving unit');
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
    if (!unit) throw new NotFoundError('Serving unit');
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
// Custom unit conversions for a product (e.g., "1 slice = 21 g"). Shared
// across the household — anyone in the household can read/write them.

function formatServingUnit(u: typeof productServingUnits.$inferSelect): ServingUnitResponse {
  return {
    id: u.id,
    productId: u.productId,
    name: u.name,
    baseUnitEquivalent: u.baseUnitEquivalent,
    targetUnit: u.targetUnit,
  };
}

export async function getServingUnits(productId: string): Promise<ServingUnitResponse[]> {
  const units = await db.query.productServingUnits.findMany({
    where: eq(productServingUnits.productId, productId),
    orderBy: asc(productServingUnits.name),
  });
  return units.map(formatServingUnit);
}

export async function createServingUnit(
  input: CreateServingUnitInput,
): Promise<ServingUnitResponse> {
  const [unit] = await db
    .insert(productServingUnits)
    .values({
      productId: input.productId,
      name: input.name,
      baseUnitEquivalent: input.baseUnitEquivalent,
      targetUnit: input.targetUnit ?? null,
    })
    .returning();
  return formatServingUnit(unit);
}

export async function updateServingUnit(
  id: string,
  input: UpdateServingUnitInput,
): Promise<ServingUnitResponse> {
  const existing = await db.query.productServingUnits.findFirst({
    where: eq(productServingUnits.id, id),
  });
  if (!existing) throw new NotFoundError('Serving unit');

  const updates: Partial<typeof productServingUnits.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.baseUnitEquivalent !== undefined) updates.baseUnitEquivalent = input.baseUnitEquivalent;
  if (input.targetUnit !== undefined) updates.targetUnit = input.targetUnit;

  const [unit] = await db
    .update(productServingUnits)
    .set(updates)
    .where(eq(productServingUnits.id, id))
    .returning();
  return formatServingUnit(unit);
}

export async function deleteServingUnit(id: string): Promise<void> {
  const existing = await db.query.productServingUnits.findFirst({
    where: eq(productServingUnits.id, id),
  });
  if (!existing) throw new NotFoundError('Serving unit');
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
    const customs: ProductCustomUnit[] = entry.product.productServingUnits ?? [];

    // Resolve the entry's quantity in the product's base unit. The chosen
    // serving unit (or standard unit code) might be in a different family;
    // productAwareConvert chains across custom edges when available.
    let totalInBaseUnit: number;
    if (entry.servingUnit) {
      const target = entry.servingUnit.targetUnit ?? baseUnit;
      const inTarget = entry.quantity * entry.servingUnit.baseUnitEquivalent;
      const converted = productAwareConvert(inTarget, target, baseUnit, { baseUnit, customUnits: customs });
      totalInBaseUnit = converted ?? inTarget; // Fall back to the raw target value if no path.
    } else if (entry.unit) {
      const converted = productAwareConvert(entry.quantity, entry.unit, baseUnit, { baseUnit, customUnits: customs });
      totalInBaseUnit = converted ?? entry.quantity;
    } else {
      // No unit at all — assume quantity is already in the base unit.
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
        transFat: (nf.transFat ?? 0) * factor,
        carbs: (nf.carbs ?? 0) * factor,
        sugars: (nf.sugars ?? 0) * factor,
        fiber: (nf.fiber ?? 0) * factor,
        protein: (nf.protein ?? 0) * factor,
        sodium: (nf.sodium ?? 0) * factor,
        potassium: (nf.potassium ?? 0) * factor,
        calcium: (nf.calcium ?? 0) * factor,
        iron: (nf.iron ?? 0) * factor,
        vitaminA: (nf.vitaminA ?? 0) * factor,
        vitaminD: (nf.vitaminD ?? 0) * factor,
        cholesterol: (nf.cholesterol ?? 0) * factor,
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

function divideNutrition(nf: NutritionalFacts, divisor: number): NutritionalFacts {
  if (divisor <= 0) return nf;
  return roundNutrition({
    calories: (nf.calories ?? 0) / divisor,
    fat: (nf.fat ?? 0) / divisor,
    saturatedFat: (nf.saturatedFat ?? 0) / divisor,
    transFat: (nf.transFat ?? 0) / divisor,
    carbs: (nf.carbs ?? 0) / divisor,
    sugars: (nf.sugars ?? 0) / divisor,
    fiber: (nf.fiber ?? 0) / divisor,
    protein: (nf.protein ?? 0) / divisor,
    sodium: (nf.sodium ?? 0) / divisor,
    potassium: (nf.potassium ?? 0) / divisor,
    calcium: (nf.calcium ?? 0) / divisor,
    iron: (nf.iron ?? 0) / divisor,
    vitaminA: (nf.vitaminA ?? 0) / divisor,
    vitaminD: (nf.vitaminD ?? 0) / divisor,
    cholesterol: (nf.cholesterol ?? 0) / divisor,
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
    sodium: (nf.sodium ?? 0) * factor,
    potassium: (nf.potassium ?? 0) * factor,
    calcium: (nf.calcium ?? 0) * factor,
    iron: (nf.iron ?? 0) * factor,
    vitaminA: (nf.vitaminA ?? 0) * factor,
    vitaminD: (nf.vitaminD ?? 0) * factor,
    cholesterol: (nf.cholesterol ?? 0) * factor,
  });
}

function sumNutrition(items: (NutritionalFacts | null)[]): NutritionalFacts {
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
  for (const nf of items) {
    if (!nf) continue;
    total.calories = (total.calories ?? 0) + (nf.calories ?? 0);
    total.fat = (total.fat ?? 0) + (nf.fat ?? 0);
    total.saturatedFat = (total.saturatedFat ?? 0) + (nf.saturatedFat ?? 0);
    total.transFat = (total.transFat ?? 0) + (nf.transFat ?? 0);
    total.carbs = (total.carbs ?? 0) + (nf.carbs ?? 0);
    total.sugars = (total.sugars ?? 0) + (nf.sugars ?? 0);
    total.fiber = (total.fiber ?? 0) + (nf.fiber ?? 0);
    total.protein = (total.protein ?? 0) + (nf.protein ?? 0);
    total.sodium = (total.sodium ?? 0) + (nf.sodium ?? 0);
    total.potassium = (total.potassium ?? 0) + (nf.potassium ?? 0);
    total.calcium = (total.calcium ?? 0) + (nf.calcium ?? 0);
    total.iron = (total.iron ?? 0) + (nf.iron ?? 0);
    total.vitaminA = (total.vitaminA ?? 0) + (nf.vitaminA ?? 0);
    total.vitaminD = (total.vitaminD ?? 0) + (nf.vitaminD ?? 0);
    total.cholesterol = (total.cholesterol ?? 0) + (nf.cholesterol ?? 0);
  }
  return roundNutrition(total);
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
