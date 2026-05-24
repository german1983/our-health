import type { NutritionalFacts } from '@personal-budget/shared';

const OFF_API_URL = process.env.OFF_API_URL || 'https://world.openfoodfacts.org/api/v2';

interface OFFProduct {
  code: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    fat_100g?: number;
    'saturated-fat_100g'?: number;
    'trans-fat_100g'?: number;
    carbohydrates_100g?: number;
    sugars_100g?: number;
    fiber_100g?: number;
    proteins_100g?: number;
    sodium_100g?: number;
    potassium_100g?: number;
    calcium_100g?: number;
    iron_100g?: number;
    'vitamin-a_100g'?: number;
    'vitamin-d_100g'?: number;
    cholesterol_100g?: number;
  };
  [key: string]: unknown;
}

interface OFFResponse {
  status: number;
  product?: OFFProduct;
}

export async function fetchProductByBarcode(barcode: string): Promise<{
  name: string;
  brand: string | null;
  imageUrl: string | null;
  nutritionalFacts: NutritionalFacts | null;
  rawData: unknown;
} | null> {
  try {
    const response = await fetch(`${OFF_API_URL}/product/${barcode}.json`);
    if (!response.ok) return null;

    const data = (await response.json()) as OFFResponse;
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const n = p.nutriments;

    // OFF returns micronutrients in grams per 100g of product. Convert to the
    // conventional label units: minerals & cholesterol in mg, vitamins in µg.
    const toMg = (v: number | undefined) => (v !== undefined ? v * 1000 : undefined);
    const toUg = (v: number | undefined) => (v !== undefined ? v * 1_000_000 : undefined);

    const nutritionalFacts: NutritionalFacts | null = n
      ? {
          calories: n['energy-kcal_100g'],
          fat: n.fat_100g,
          saturatedFat: n['saturated-fat_100g'],
          transFat: n['trans-fat_100g'],
          carbs: n.carbohydrates_100g,
          sugars: n.sugars_100g,
          fiber: n.fiber_100g,
          protein: n.proteins_100g,
          sodium: toMg(n.sodium_100g),
          potassium: toMg(n.potassium_100g),
          calcium: toMg(n.calcium_100g),
          iron: toMg(n.iron_100g),
          vitaminA: toUg(n['vitamin-a_100g']),
          vitaminD: toUg(n['vitamin-d_100g']),
          cholesterol: toMg(n.cholesterol_100g),
        }
      : null;

    return {
      name: p.product_name || `Product ${barcode}`,
      brand: p.brands || null,
      imageUrl: p.image_url || null,
      nutritionalFacts,
      rawData: data.product,
    };
  } catch (err) {
    console.error('Open Food Facts fetch error:', err);
    return null;
  }
}
