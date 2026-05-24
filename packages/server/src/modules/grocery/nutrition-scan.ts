import OpenAI from 'openai';
import type { NutritionalFacts } from '@personal-budget/shared';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini';

/**
 * Extract nutritional facts from a packaged-food label photo using OpenAI's
 * vision endpoint. Mirrors the receipt parser's pattern — a strict
 * json_schema response so the client can apply the fields directly.
 */

const SYSTEM_PROMPT = `You extract nutritional facts from a packaged-food label photograph.

Always return a single JSON object with these fields:
- baseAmount: the reference quantity printed on the label (e.g., 100 for "per 100 g", 30 for "per 30 g serving"). Positive number.
- baseUnit: the unit the baseAmount is in. Allowed codes: "g", "kg", "mg", "ml", "cl", "dl", "L", "fl_oz", "oz", "lb", "cup", "tbsp", "tsp", "unit", "piece", "serving". Use "g" if the label is ambiguous.
- facts: nutrient values, all per (baseAmount × baseUnit):
  - calories (kcal)
  - fat (g)
  - saturatedFat (g)
  - transFat (g)
  - carbs (g)
  - sugars (g)
  - fiber (g)
  - protein (g)
  - sodium (mg)
  - potassium (mg)
  - calcium (mg)
  - iron (mg)
  - vitaminA (µg)
  - vitaminD (µg)
  - cholesterol (mg)

Rules:
- Prefer the "per 100 g" / "per 100 ml" column when one is printed. Otherwise use the per-serving column and set baseAmount/baseUnit accordingly.
- Use null for any nutrient that isn't on the label. Don't guess.
- All numeric values must be valid JSON numbers, never strings.
- Don't infer values from the product name or category — only what is printed.
- Convert units to the target (mg / µg) where needed. If a label shows sodium in g, multiply by 1000 to give mg.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    baseAmount: { type: 'number' },
    baseUnit: { type: 'string' },
    facts: {
      type: 'object',
      properties: {
        calories: { type: ['number', 'null'] },
        fat: { type: ['number', 'null'] },
        saturatedFat: { type: ['number', 'null'] },
        transFat: { type: ['number', 'null'] },
        carbs: { type: ['number', 'null'] },
        sugars: { type: ['number', 'null'] },
        fiber: { type: ['number', 'null'] },
        protein: { type: ['number', 'null'] },
        sodium: { type: ['number', 'null'] },
        potassium: { type: ['number', 'null'] },
        calcium: { type: ['number', 'null'] },
        iron: { type: ['number', 'null'] },
        vitaminA: { type: ['number', 'null'] },
        vitaminD: { type: ['number', 'null'] },
        cholesterol: { type: ['number', 'null'] },
      },
      required: [
        'calories',
        'fat',
        'saturatedFat',
        'transFat',
        'carbs',
        'sugars',
        'fiber',
        'protein',
        'sodium',
        'potassium',
        'calcium',
        'iron',
        'vitaminA',
        'vitaminD',
        'cholesterol',
      ],
      additionalProperties: false,
    },
  },
  required: ['baseAmount', 'baseUnit', 'facts'],
  additionalProperties: false,
} as const;

interface ModelResponse {
  baseAmount: number;
  baseUnit: string;
  facts: {
    calories: number | null;
    fat: number | null;
    saturatedFat: number | null;
    transFat: number | null;
    carbs: number | null;
    sugars: number | null;
    fiber: number | null;
    protein: number | null;
    sodium: number | null;
    potassium: number | null;
    calcium: number | null;
    iron: number | null;
    vitaminA: number | null;
    vitaminD: number | null;
    cholesterol: number | null;
  };
}

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

export interface ParsedNutritionLabel {
  baseAmount: number;
  baseUnit: string;
  facts: NutritionalFacts;
  parserVersion: string;
}

/** Strip nulls so the result fits NutritionalFacts (optional fields). */
function pruneNulls(input: ModelResponse['facts']): NutritionalFacts {
  const out: NutritionalFacts = {};
  for (const [k, v] of Object.entries(input)) {
    if (v != null && Number.isFinite(v) && v >= 0) {
      (out as Record<string, number>)[k] = v;
    }
  }
  return out;
}

export async function parseNutritionLabel(imageDataUrl: string): Promise<ParsedNutritionLabel> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the nutritional facts from this label.' },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'parsed_nutrition', strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned an empty response');
  const model = JSON.parse(raw) as ModelResponse;

  return {
    baseAmount: model.baseAmount > 0 ? model.baseAmount : 100,
    baseUnit: model.baseUnit || 'g',
    facts: pruneNulls(model.facts),
    parserVersion: `openai:${MODEL}`,
  };
}
