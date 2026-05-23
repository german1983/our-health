import { z } from 'zod';

// ==================== Unit Families ====================

export const UNIT_FAMILIES = ['MASS', 'VOLUME', 'COUNT'] as const;
export type UnitFamily = (typeof UNIT_FAMILIES)[number];

// Base units per family: MASS=g, VOLUME=ml, COUNT=unit

export interface UnitDefinition {
  code: string;
  name: string;
  family: UnitFamily;
  /** Factor to convert 1 of this unit to the family's base unit. */
  toBaseFactor: number;
}

// ==================== Unit Definitions ====================

export const UNITS: Record<string, UnitDefinition> = {
  // Mass (base: g)
  mg: { code: 'mg', name: 'milligrams', family: 'MASS', toBaseFactor: 0.001 },
  g: { code: 'g', name: 'grams', family: 'MASS', toBaseFactor: 1 },
  kg: { code: 'kg', name: 'kilograms', family: 'MASS', toBaseFactor: 1000 },
  oz: { code: 'oz', name: 'ounces', family: 'MASS', toBaseFactor: 28.3495 },
  lb: { code: 'lb', name: 'pounds', family: 'MASS', toBaseFactor: 453.592 },
  // Volume (base: ml)
  ml: { code: 'ml', name: 'milliliters', family: 'VOLUME', toBaseFactor: 1 },
  cl: { code: 'cl', name: 'centiliters', family: 'VOLUME', toBaseFactor: 10 },
  dl: { code: 'dl', name: 'deciliters', family: 'VOLUME', toBaseFactor: 100 },
  L: { code: 'L', name: 'liters', family: 'VOLUME', toBaseFactor: 1000 },
  fl_oz: { code: 'fl_oz', name: 'fluid ounces', family: 'VOLUME', toBaseFactor: 29.5735 },
  cup: { code: 'cup', name: 'cups', family: 'VOLUME', toBaseFactor: 236.588 },
  tbsp: { code: 'tbsp', name: 'tablespoons', family: 'VOLUME', toBaseFactor: 14.7868 },
  tsp: { code: 'tsp', name: 'teaspoons', family: 'VOLUME', toBaseFactor: 4.92892 },
  // Count (base: unit)
  unit: { code: 'unit', name: 'units', family: 'COUNT', toBaseFactor: 1 },
  piece: { code: 'piece', name: 'pieces', family: 'COUNT', toBaseFactor: 1 },
  serving: { code: 'serving', name: 'servings', family: 'COUNT', toBaseFactor: 1 },
};

export const UNIT_CODES = Object.keys(UNITS) as [string, ...string[]];

export const unitCodeSchema = z.enum(UNIT_CODES as [string, ...string[]]);
export type UnitCode = z.infer<typeof unitCodeSchema>;

// ==================== Helpers ====================

/** Get all units belonging to a given family. */
export function getUnitsByFamily(family: UnitFamily): UnitDefinition[] {
  return Object.values(UNITS).filter((u) => u.family === family);
}

/** Check if two unit codes are in the same family (auto-convertible). */
export function areUnitsCompatible(a: string, b: string): boolean {
  const unitA = UNITS[a];
  const unitB = UNITS[b];
  if (!unitA || !unitB) return false;
  return unitA.family === unitB.family;
}

/**
 * Convert a quantity from one unit to another within the same family.
 * Throws if the units are not in the same family.
 */
export function convertUnit(qty: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return qty;
  const from = UNITS[fromUnit];
  const to = UNITS[toUnit];
  if (!from || !to) throw new Error(`Unknown unit: ${from ? toUnit : fromUnit}`);
  if (from.family !== to.family) {
    throw new Error(`Cannot convert between ${from.family} (${fromUnit}) and ${to.family} (${toUnit})`);
  }
  const inBase = qty * from.toBaseFactor;
  return inBase / to.toBaseFactor;
}

/** Get all standard units in the same family as the given unit code (for dropdowns). */
export function getCompatibleUnits(unitCode: string): UnitDefinition[] {
  const unit = UNITS[unitCode];
  if (!unit) return [];
  return getUnitsByFamily(unit.family);
}

/** Get all standard units NOT in the same family as the given unit code. */
export function getOtherFamilyUnits(unitCode: string): UnitDefinition[] {
  const unit = UNITS[unitCode];
  if (!unit) return [];
  return Object.values(UNITS).filter((u) => u.family !== unit.family);
}
