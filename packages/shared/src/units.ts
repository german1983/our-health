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

// ==================== Product-aware conversion ====================

/**
 * A per-product custom equivalence: "1 [name] = baseUnitEquivalent of
 * targetUnit." When targetUnit is null we treat it as the product's base
 * unit (preserves the original "1 slice = 21 g on a g-base product" pattern).
 *
 * Custom rows whose name/target straddle two unit families act as bridges
 * that let `productAwareConvert` cross from mass to volume to count for a
 * specific product (e.g., density: name='g', equivalent=1, target='ml').
 */
export interface ProductCustomUnit {
  name: string;
  baseUnitEquivalent: number;
  targetUnit?: string | null;
}

/** Convert within the same physical family; returns null otherwise. */
function trySameFamilyConvert(qty: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return qty;
  const f = UNITS[fromUnit];
  const t = UNITS[toUnit];
  if (!f || !t) return null;
  if (f.family !== t.family) return null;
  try {
    return convertUnit(qty, fromUnit, toUnit);
  } catch {
    return null;
  }
}

/** Try one custom edge as a bridge from `from` to `to`. Returns null on miss. */
function tryBridge(
  qty: number,
  from: string,
  to: string,
  c: ProductCustomUnit,
  baseUnit: string,
): number | null {
  const target = c.targetUnit ?? baseUnit;
  // Forward: from → c.name (same-family) → multiply by equivalent to land in target → to (same-family)
  const a = trySameFamilyConvert(qty, from, c.name);
  if (a != null) {
    const inTarget = a * c.baseUnitEquivalent;
    const final = trySameFamilyConvert(inTarget, target, to);
    if (final != null) return final;
  }
  // Reverse: from → target (same-family) → divide by equivalent to land in c.name → to (same-family)
  const a2 = trySameFamilyConvert(qty, from, target);
  if (a2 != null && c.baseUnitEquivalent !== 0) {
    const inCustom = a2 / c.baseUnitEquivalent;
    const final = trySameFamilyConvert(inCustom, c.name, to);
    if (final != null) return final;
  }
  return null;
}

/**
 * Convert `qty` from `fromUnit` to `toUnit` for a specific product. Tries
 * (in order): identity, same-family physical, single-hop via a custom unit,
 * two-hop via chained custom units. Returns null when no path is found.
 *
 * Two-hop covers the common "1 slice = 21 g" + "1 g = 1 ml" → asking for
 * slices in ml, which needs to chain through grams.
 */
export function productAwareConvert(
  qty: number,
  fromUnit: string,
  toUnit: string,
  opts: { baseUnit: string; customUnits?: ProductCustomUnit[] },
): number | null {
  const direct = trySameFamilyConvert(qty, fromUnit, toUnit);
  if (direct != null) return direct;

  const customs = opts.customUnits ?? [];
  const baseUnit = opts.baseUnit;

  // Single-hop: try each custom edge.
  for (const c of customs) {
    const result = tryBridge(qty, fromUnit, toUnit, c, baseUnit);
    if (result != null) return result;
  }

  // Two-hop: chain through a first custom edge, then bridge the rest.
  for (const c1 of customs) {
    const target1 = c1.targetUnit ?? baseUnit;
    // Forward through c1: from → c1.name → target1.
    const a = trySameFamilyConvert(qty, fromUnit, c1.name);
    if (a != null) {
      const inTarget1 = a * c1.baseUnitEquivalent;
      for (const c2 of customs) {
        if (c2 === c1) continue;
        const r = tryBridge(inTarget1, target1, toUnit, c2, baseUnit);
        if (r != null) return r;
      }
    }
    // Reverse through c1: from → target1 → c1.name.
    if (c1.baseUnitEquivalent === 0) continue;
    const a2 = trySameFamilyConvert(qty, fromUnit, target1);
    if (a2 != null) {
      const inC1 = a2 / c1.baseUnitEquivalent;
      for (const c2 of customs) {
        if (c2 === c1) continue;
        const r = tryBridge(inC1, c1.name, toUnit, c2, baseUnit);
        if (r != null) return r;
      }
    }
  }

  return null;
}

/**
 * Which standard unit families are reachable from `baseUnit` given the
 * product's customs? Used by the UI to decide which families to expose
 * in pickers (e.g., expose volume units when the product has a density-like
 * row that bridges mass ↔ volume).
 */
export function reachableFamilies(
  baseUnit: string,
  customUnits: ProductCustomUnit[] = [],
): Set<UnitFamily> {
  const reachable = new Set<UnitFamily>();
  const base = UNITS[baseUnit];
  if (base) reachable.add(base.family);

  // Probe each pair (base → every family) and see if a path exists.
  for (const fam of UNIT_FAMILIES) {
    if (reachable.has(fam)) continue;
    const probeTarget = fam === 'MASS' ? 'g' : fam === 'VOLUME' ? 'ml' : 'unit';
    if (productAwareConvert(1, baseUnit, probeTarget, { baseUnit, customUnits }) != null) {
      reachable.add(fam);
    }
  }
  return reachable;
}
