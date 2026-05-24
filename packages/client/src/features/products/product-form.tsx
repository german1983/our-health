import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import api from '@/lib/api';
import { UNITS } from '@personal-budget/shared';
import type { CategoryResponse, CreateProductInput } from '@personal-budget/shared';
import {
  NUTRITION_FIELDS,
  emptyNutritionForm,
  formToNutrition,
  type NutritionFormState,
} from './nutrition-fields';

const ALL_UNITS = Object.values(UNITS);

function flattenExpenseCategories(tree: CategoryResponse[]): CategoryResponse[] {
  const out: CategoryResponse[] = [];
  function walk(nodes: CategoryResponse[], depth: number) {
    for (const n of nodes) {
      out.push({ ...n, name: `${'— '.repeat(depth)}${n.name}` });
      if (n.children) walk(n.children, depth + 1);
    }
  }
  walk(tree.filter((c) => c.type === 'EXPENSE'), 0);
  return out;
}

export interface ProductFormState {
  name: string;
  brand: string;
  imageUrl: string;
  categoryId: string;
  baseAmount: string;
  baseUnit: string;
  nutrition: NutritionFormState;
  /** Primary (default) presentation that gets created alongside the product. */
  presentationName: string;
  presentationAmount: string;
  presentationUnit: string;
  presentationBarcode: string;
}

export const emptyProductForm: ProductFormState = {
  name: '',
  brand: '',
  imageUrl: '',
  categoryId: '',
  baseAmount: '100',
  baseUnit: 'g',
  nutrition: emptyNutritionForm,
  presentationName: '',
  presentationAmount: '',
  presentationUnit: 'g',
  presentationBarcode: '',
};

/** Build the input payload that `POST /products` expects from form state. */
export function formToCreateInput(form: ProductFormState): CreateProductInput {
  const baseAmount = parseFloat(form.baseAmount);
  const presAmount = parseFloat(form.presentationAmount);
  const hasPresentation =
    form.presentationName.trim().length > 0 &&
    Number.isFinite(presAmount) &&
    presAmount > 0;
  return {
    name: form.name.trim(),
    brand: form.brand.trim() || undefined,
    imageUrl: form.imageUrl.trim() || undefined,
    categoryId: form.categoryId || null,
    nutritionBaseAmount: Number.isFinite(baseAmount) && baseAmount > 0 ? baseAmount : undefined,
    nutritionBaseUnit: form.baseUnit,
    nutritionalFacts: formToNutrition(form.nutrition) ?? undefined,
    defaultPresentation: hasPresentation
      ? {
          name: form.presentationName.trim(),
          amount: presAmount,
          unit: form.presentationUnit,
          barcode: form.presentationBarcode.trim() || undefined,
        }
      : undefined,
  };
}

interface ProductFormProps {
  value: ProductFormState;
  onChange: (next: ProductFormState) => void;
  /** Compact two-column layout vs. single column (default: true). */
  twoColumn?: boolean;
}

/**
 * Shared edit/create form for product fields. The nutritional facts section
 * is gated on the selected category's `hasNutritionalFacts` flag, so things
 * like cleaning supplies don't get a "Calories" input.
 */
export function ProductForm({ value, onChange, twoColumn = true }: ProductFormProps) {
  const [categoryTouched, setCategoryTouched] = useState(!!value.categoryId);

  const { data: categoryTree } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<CategoryResponse[]>('/finance/categories').then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const expenseCategories = useMemo(
    () => (categoryTree ? flattenExpenseCategories(categoryTree) : []),
    [categoryTree],
  );

  const selectedCategory = useMemo(
    () => expenseCategories.find((c) => c.id === value.categoryId) ?? null,
    [expenseCategories, value.categoryId],
  );

  // If the parent passed in a categoryId (e.g. prefilled from a receipt line),
  // honor it. Otherwise once categories load and the user hasn't touched it,
  // we leave it blank so they choose explicitly.
  useEffect(() => {
    if (value.categoryId) setCategoryTouched(true);
  }, [value.categoryId]);

  const showNutrition = selectedCategory?.hasNutritionalFacts ?? false;

  const set = <K extends keyof ProductFormState>(key: K, v: ProductFormState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div className={twoColumn ? 'grid sm:grid-cols-2 gap-3' : 'space-y-3'}>
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={value.name}
            onChange={(e) => set('name', e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Brand</label>
          <Input value={value.brand} onChange={(e) => set('brand', e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium">Image URL</label>
          <Input
            value={value.imageUrl}
            onChange={(e) => set('imageUrl', e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium">Category</label>
          <Select
            value={value.categoryId}
            onChange={(e) => {
              setCategoryTouched(true);
              set('categoryId', e.target.value);
            }}
          >
            <option value="">— Uncategorized —</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.hasNutritionalFacts ? ' · 🍎' : ''}
              </option>
            ))}
          </Select>
          {value.categoryId && !categoryTouched && (
            <p className="text-xs text-muted-foreground">
              Prefilled from the receipt line — change if needed.
            </p>
          )}
        </div>
      </div>

      {/* Primary presentation. This is the SKU you actually buy — the barcode
          lives here, not on the conceptual product. Additional sizes can be
          added later from the product detail page. */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="text-sm font-medium">Primary presentation (the size you usually buy)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={value.presentationName}
              onChange={(e) => set('presentationName', e.target.value)}
              placeholder="e.g. 800 g jar"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Amount</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={value.presentationAmount}
              onChange={(e) => set('presentationAmount', e.target.value)}
              placeholder="800"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unit</label>
            <Select
              value={value.presentationUnit}
              onChange={(e) => set('presentationUnit', e.target.value)}
            >
              {ALL_UNITS.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-4">
            <label className="text-xs text-muted-foreground">Barcode / GTIN</label>
            <Input
              value={value.presentationBarcode}
              onChange={(e) => set('presentationBarcode', e.target.value)}
              className="font-mono"
              placeholder="(optional — bulk produce can skip this)"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Skip the name/amount to plant a generic "Default" 1-unit placeholder you can edit
          later.
        </p>
      </div>

      {showNutrition ? (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Nutritional facts per</span>
            <Input
              type="number"
              step="0.1"
              value={value.baseAmount}
              onChange={(e) => set('baseAmount', e.target.value)}
              className="w-20"
            />
            <Select
              value={value.baseUnit}
              onChange={(e) => set('baseUnit', e.target.value)}
              className="w-28"
            >
              {ALL_UNITS.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted-foreground">(all optional)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {NUTRITION_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {label} ({unit})
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={value.nutrition[key]}
                  onChange={(e) =>
                    set('nutrition', { ...value.nutrition, [key]: e.target.value })
                  }
                  placeholder="-"
                />
              </div>
            ))}
          </div>
        </div>
      ) : selectedCategory ? (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Nutritional facts are hidden because{' '}
          <span className="font-medium">{selectedCategory.name.replace(/^(— )+/, '')}</span>{' '}
          isn't marked as a food category.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Pick a category to enable nutritional facts.
        </p>
      )}
    </div>
  );
}
