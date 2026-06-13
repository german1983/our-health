import type { NutritionalFacts } from '@personal-budget/shared';

export const NUTRITION_FIELDS: { key: keyof NutritionalFacts; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated Fat', unit: 'g' },
  { key: 'transFat', label: 'Trans Fat', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'µg' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'µg' },
];

export type NutritionFormState = Record<keyof NutritionalFacts, string>;

export const emptyNutritionForm: NutritionFormState = {
  calories: '',
  fat: '',
  saturatedFat: '',
  transFat: '',
  carbs: '',
  sugars: '',
  fiber: '',
  protein: '',
  sodium: '',
  potassium: '',
  calcium: '',
  iron: '',
  vitaminA: '',
  vitaminD: '',
  cholesterol: '',
};

export function nutritionToForm(nf: NutritionalFacts | null): NutritionFormState {
  if (!nf) return { ...emptyNutritionForm };
  const out = { ...emptyNutritionForm };
  for (const { key } of NUTRITION_FIELDS) {
    const v = nf[key];
    out[key] = v !== undefined && v !== null ? String(v) : '';
  }
  return out;
}

export function formToNutrition(form: NutritionFormState): NutritionalFacts | null {
  const result: NutritionalFacts = {};
  let any = false;
  for (const { key } of NUTRITION_FIELDS) {
    const v = form[key];
    if (v !== '' && v !== undefined) {
      const num = parseFloat(v);
      if (!Number.isNaN(num)) {
        result[key] = num;
        any = true;
      }
    }
  }
  return any ? result : null;
}
