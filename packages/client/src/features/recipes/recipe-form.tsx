import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { UNITS } from '@personal-budget/shared';
import type {
  ProductResponse,
  RecipeDetailResponse,
  RecipeIngredientResponse,
} from '@personal-budget/shared';

const ALL_UNITS = Object.values(UNITS);

export interface IngredientFormItem {
  productId: string;
  productName: string;
  quantity: string;
  unit: string;
  notes: string;
}

export interface RecipeFormValues {
  name: string;
  description: string;
  instructions: string;
  externalUrl: string;
  servings: string;
  servingUnit: string;
  servingWeightGrams: string;
  prepTime: string;
  cookTime: string;
  ingredients: IngredientFormItem[];
}

export interface RecipeFormSubmitPayload {
  name: string;
  description?: string;
  instructions?: string;
  externalUrl?: string;
  servings: number;
  servingUnit?: string;
  servingWeightGrams?: number;
  prepTime?: number;
  cookTime?: number;
  ingredients: { productId: string; quantity: number; unit: string; notes?: string }[];
}

interface Props {
  initialValues?: RecipeFormValues;
  submitLabel: string;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (values: RecipeFormSubmitPayload) => void;
}

const EMPTY: RecipeFormValues = {
  name: '',
  description: '',
  instructions: '',
  externalUrl: '',
  servings: '4',
  servingUnit: '',
  servingWeightGrams: '',
  prepTime: '',
  cookTime: '',
  ingredients: [],
};

export function RecipeForm({ initialValues, submitLabel, submitting, onCancel, onSubmit }: Props) {
  const init = initialValues ?? EMPTY;
  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [instructions, setInstructions] = useState(init.instructions);
  const [externalUrl, setExternalUrl] = useState(init.externalUrl);
  const [servings, setServings] = useState(init.servings);
  const [servingUnit, setServingUnit] = useState(init.servingUnit);
  const [servingWeightGrams, setServingWeightGrams] = useState(init.servingWeightGrams);
  const [prepTime, setPrepTime] = useState(init.prepTime);
  const [cookTime, setCookTime] = useState(init.cookTime);
  const [ingredients, setIngredients] = useState<IngredientFormItem[]>(init.ingredients);
  const [ingredientSearch, setIngredientSearch] = useState('');

  const servingsNum = parseInt(servings) || 0;
  const weightNum = parseFloat(servingWeightGrams) || 0;
  const totalWeight = servingsNum > 0 && weightNum > 0 ? servingsNum * weightNum : null;

  const { data: productResults } = useQuery({
    queryKey: ['products', 'search', ingredientSearch],
    queryFn: () =>
      api
        .get<{ items: ProductResponse[] }>('/products', { params: { query: ingredientSearch } })
        .then((r) => r.data.items),
    enabled: ingredientSearch.length > 1,
  });

  function addIngredient(product: ProductResponse) {
    setIngredients([
      ...ingredients,
      {
        productId: product.id,
        productName: product.name,
        quantity: '100',
        unit: product.nutritionBaseUnit || 'g',
        notes: '',
      },
    ]);
    setIngredientSearch('');
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function updateIngredient(index: number, patch: Partial<IngredientFormItem>) {
    setIngredients(ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      instructions: instructions || undefined,
      externalUrl: externalUrl.trim() || undefined,
      servings: parseInt(servings) || 1,
      servingUnit: servingUnit.trim() || undefined,
      servingWeightGrams: weightNum > 0 ? weightNum : undefined,
      prepTime: prepTime ? parseInt(prepTime) : undefined,
      cookTime: cookTime ? parseInt(cookTime) : undefined,
      ingredients: ingredients.map((ing) => ({
        productId: ing.productId,
        quantity: parseFloat(ing.quantity),
        unit: ing.unit,
        notes: ing.notes || undefined,
      })),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder="Step-by-step cooking instructions. One paragraph per step works well."
            className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">External link (optional)</label>
          <Input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            type="url"
            placeholder="https://example.com/some-recipe"
          />
        </div>
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Makes</label>
              <Input
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="2"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Unit name</label>
              <Input
                value={servingUnit}
                onChange={(e) => setServingUnit(e.target.value)}
                placeholder="e.g., bar, muffin"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Weight each (g)</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={servingWeightGrams}
                onChange={(e) => setServingWeightGrams(e.target.value)}
                placeholder="400"
              />
            </div>
          </div>
          {totalWeight !== null && (
            <p className="text-xs text-muted-foreground">
              = {totalWeight} g total{servingUnit ? ` (${servingsNum} ${servingUnit}${servingsNum === 1 ? '' : 's'})` : ''}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Prep (min)</label>
            <Input
              type="number"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cook (min)</label>
            <Input
              type="number"
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Ingredients</label>
          <Input
            value={ingredientSearch}
            onChange={(e) => setIngredientSearch(e.target.value)}
            placeholder="Search products to add..."
          />
          {productResults && productResults.length > 0 && ingredientSearch && (
            <div className="border border-border rounded-md max-h-32 overflow-y-auto">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => addIngredient(p)}
                >
                  {p.name} {p.brand && `(${p.brand})`}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded">
                <span className="text-sm flex-1 truncate" title={ing.productName}>
                  {ing.productName}
                </span>
                <Input
                  className="w-20"
                  type="number"
                  step="0.1"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, { quantity: e.target.value })}
                />
                <Select
                  className="w-24"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, { unit: e.target.value })}
                >
                  {ALL_UNITS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeIngredient(i)}
                  aria-label="Remove ingredient"
                >
                  X
                </Button>
              </div>
            ))}
            {ingredients.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                No ingredients yet — search above to add some.
              </p>
            )}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || ingredients.length === 0}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ingredientsToFormItems(items: RecipeIngredientResponse[]): IngredientFormItem[] {
  return items.map((ing) => ({
    productId: ing.productId,
    productName: ing.productName,
    quantity: String(ing.quantity),
    unit: ing.unit,
    notes: ing.notes ?? '',
  }));
}

export function recipeToFormValues(recipe: RecipeDetailResponse): RecipeFormValues {
  return {
    name: recipe.name,
    description: recipe.description ?? '',
    instructions: recipe.instructions ?? '',
    externalUrl: recipe.externalUrl ?? '',
    servings: String(recipe.servings),
    servingUnit: recipe.servingUnit ?? '',
    servingWeightGrams: recipe.servingWeightGrams != null ? String(recipe.servingWeightGrams) : '',
    prepTime: recipe.prepTime !== null ? String(recipe.prepTime) : '',
    cookTime: recipe.cookTime !== null ? String(recipe.cookTime) : '',
    ingredients: ingredientsToFormItems(recipe.ingredients),
  };
}
