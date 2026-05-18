import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import {
  UNITS,
  getCompatibleUnits,
  getOtherFamilyUnits,
} from '@personal-budget/shared';
import type {
  DailyLogResponse,
  MealSlot,
  IntakeEntryResponse,
  ProductResponse,
  RecipeResponse,
  ServingUnitResponse,
  BrandResponse,
} from '@personal-budget/shared';

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  BREAKFAST: 'Breakfast',
  MID_MORNING_SNACK: 'Mid-Morning Snack',
  LUNCH: 'Lunch',
  AFTERNOON_SNACK: 'Afternoon Snack',
  DINNER: 'Dinner',
  EVENING_SNACK: 'Evening Snack',
};

const ALL_MEAL_SLOTS: MealSlot[] = [
  'BREAKFAST',
  'MID_MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
  'EVENING_SNACK',
];

const ALL_UNITS = Object.values(UNITS);

type AddDialogMode = 'search' | 'newProduct' | 'newUnit';

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function fmtN(value: number | undefined): string {
  if (value === undefined) return '-';
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export function IntakePage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
  const [collapsedMeals, setCollapsedMeals] = useState<Set<MealSlot>>(new Set());

  // Add entry dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogMode, setAddDialogMode] = useState<AddDialogMode>('search');
  const [addMealSlot, setAddMealSlot] = useState<MealSlot>('BREAKFAST');
  const [entryType, setEntryType] = useState<'product' | 'recipe'>('product');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductBaseUnit, setSelectedProductBaseUnit] = useState('g');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [selectedRecipeName, setSelectedRecipeName] = useState('');
  const [entryQuantity, setEntryQuantity] = useState('100');
  const [entryServingUnitId, setEntryServingUnitId] = useState('');
  const [entryUnit, setEntryUnit] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  // New product form (inline within add dialog)
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [newProductBaseAmount, setNewProductBaseAmount] = useState('100');
  const [newProductBaseUnit, setNewProductBaseUnit] = useState('g');
  const [newProductCalories, setNewProductCalories] = useState('');
  const [newProductFat, setNewProductFat] = useState('');
  const [newProductCarbs, setNewProductCarbs] = useState('');
  const [newProductProtein, setNewProductProtein] = useState('');
  const [newProductSugars, setNewProductSugars] = useState('');
  const [newProductFiber, setNewProductFiber] = useState('');
  const [newProductSalt, setNewProductSalt] = useState('');
  const [barcodeLookupError, setBarcodeLookupError] = useState('');

  // New serving unit form (inline within add dialog)
  const [unitName, setUnitName] = useState('');
  const [unitGrams, setUnitGrams] = useState('');
  const [unitDropdownValue, setUnitDropdownValue] = useState('custom');

  // Edit entry dialog
  const [editingEntry, setEditingEntry] = useState<IntakeEntryResponse | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editServingUnitId, setEditServingUnitId] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editMealSlot, setEditMealSlot] = useState<MealSlot>('BREAKFAST');

  // ==================== Queries ====================

  const { data: dailyLog } = useQuery({
    queryKey: ['intake', 'log', selectedDate],
    queryFn: () => api.get<DailyLogResponse>('/intake/log', { params: { date: selectedDate } }).then((r) => r.data),
  });

  const { data: productResults } = useQuery({
    queryKey: ['products', 'search', searchQuery],
    queryFn: () =>
      api.get<{ items: ProductResponse[] }>('/products', { params: { query: searchQuery } }).then((r) => r.data.items),
    enabled: entryType === 'product' && searchQuery.length > 1 && addDialogMode === 'search',
  });

  const { data: recipeResults } = useQuery({
    queryKey: ['recipes', 'search', searchQuery],
    queryFn: () => api.get<RecipeResponse[]>('/recipes').then((r) => r.data),
    enabled: entryType === 'recipe' && searchQuery.length > 1 && addDialogMode === 'search',
  });

  const filteredRecipes = recipeResults?.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const { data: servingUnits } = useQuery({
    queryKey: ['intake', 'serving-units', selectedProductId],
    queryFn: () =>
      api.get<ServingUnitResponse[]>('/intake/serving-units', { params: { productId: selectedProductId } }).then((r) => r.data),
    enabled: !!selectedProductId,
  });

  const { data: editServingUnits } = useQuery({
    queryKey: ['intake', 'serving-units', editingEntry?.productId],
    queryFn: () =>
      api.get<ServingUnitResponse[]>('/intake/serving-units', { params: { productId: editingEntry!.productId } }).then((r) => r.data),
    enabled: !!editingEntry?.productId,
  });

  const { data: brandResults } = useQuery({
    queryKey: ['brands', brandSearch],
    queryFn: () => api.get<BrandResponse[]>('/brands', { params: { query: brandSearch } }).then((r) => r.data),
    enabled: brandSearch.length > 0 && addDialogMode === 'newProduct',
  });

  // ==================== Mutations ====================

  const createEntryMutation = useMutation({
    mutationFn: (data: {
      date: string;
      mealSlot: MealSlot;
      productId?: string;
      recipeId?: string;
      quantity: number;
      servingUnitId?: string;
      unit?: string;
      notes?: string;
    }) => api.post('/intake/entries', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake', 'log', selectedDate] });
      closeAddDialog();
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; mealSlot?: MealSlot; quantity?: number; servingUnitId?: string | null; unit?: string | null }) =>
      api.patch(`/intake/entries/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake', 'log', selectedDate] });
      setEditingEntry(null);
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/intake/entries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['intake', 'log', selectedDate] }),
  });

  const barcodeLookupMutation = useMutation({
    mutationFn: (barcode: string) =>
      api.get<ProductResponse>(`/products/barcode/${barcode}`).then((r) => r.data),
    onSuccess: (product) => {
      const nf = product.nutritionalFacts;
      setNewProductName(product.name);
      setNewProductBrand(product.brand ?? '');
      setBrandSearch(product.brand ?? '');
      setNewProductBaseAmount(String(product.nutritionBaseAmount));
      setNewProductBaseUnit(product.nutritionBaseUnit);
      setNewProductCalories(nf?.calories != null ? String(nf.calories) : '');
      setNewProductFat(nf?.fat != null ? String(nf.fat) : '');
      setNewProductCarbs(nf?.carbs != null ? String(nf.carbs) : '');
      setNewProductProtein(nf?.protein != null ? String(nf.protein) : '');
      setNewProductSugars(nf?.sugars != null ? String(nf.sugars) : '');
      setNewProductFiber(nf?.fiber != null ? String(nf.fiber) : '');
      setNewProductSalt(nf?.salt != null ? String(nf.salt) : '');
      setBarcodeLookupError('');
      // Product already in DB — select it directly
      selectCreatedProduct(product);
    },
    onError: () => {
      setBarcodeLookupError('Barcode not found. Fill details manually below.');
    },
  });

  const createProductMutation = useMutation({
    mutationFn: (data: {
      name: string;
      barcode?: string;
      brand?: string;
      nutritionBaseAmount?: number;
      nutritionBaseUnit?: string;
      nutritionalFacts?: Record<string, number>;
    }) => api.post<ProductResponse>('/products', data).then((r) => r.data),
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      selectCreatedProduct(product);
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: (data: { productId: string; name: string; baseUnitEquivalent: number }) =>
      api.post('/intake/serving-units', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake', 'serving-units', selectedProductId] });
      setAddDialogMode('search');
      setUnitName('');
      setUnitGrams('');
      setUnitDropdownValue('custom');
    },
  });

  // ==================== Computed ====================

  // Units in the same family as the selected product's base unit
  const compatibleUnits = selectedProductId ? getCompatibleUnits(selectedProductBaseUnit) : [];
  // Units in other families (for serving unit creation dropdown)
  const otherFamilyUnits = selectedProductId ? getOtherFamilyUnits(selectedProductBaseUnit) : [];

  // Same for edit dialog
  const editProductBaseUnit = editingEntry?.calculatedUnit || 'g';
  const editCompatibleUnits = editingEntry?.productId ? getCompatibleUnits(editProductBaseUnit) : [];

  // ==================== Handlers ====================

  function navigateDate(offset: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(toDateString(d));
  }

  function openAddDialog(slot: MealSlot) {
    setAddMealSlot(slot);
    setAddDialogMode('search');
    setEntryType('product');
    setSearchQuery('');
    setSelectedProductId('');
    setSelectedProductName('');
    setSelectedProductBaseUnit('g');
    setSelectedRecipeId('');
    setSelectedRecipeName('');
    setEntryQuantity('100');
    setEntryServingUnitId('');
    setEntryUnit('');
    setEntryNotes('');
    setShowAddDialog(true);
  }

  function closeAddDialog() {
    setShowAddDialog(false);
    setAddDialogMode('search');
  }

  function openNewProductMode() {
    setAddDialogMode('newProduct');
    resetNewProductForm();
  }

  function resetNewProductForm() {
    setNewProductBarcode('');
    setNewProductName('');
    setNewProductBrand('');
    setBrandSearch('');
    setNewProductBaseAmount('100');
    setNewProductBaseUnit('g');
    setNewProductCalories('');
    setNewProductFat('');
    setNewProductCarbs('');
    setNewProductProtein('');
    setNewProductSugars('');
    setNewProductFiber('');
    setNewProductSalt('');
    setBarcodeLookupError('');
  }

  function selectCreatedProduct(product: ProductResponse) {
    setSelectedProductId(product.id);
    setSelectedProductName(product.name);
    setSelectedProductBaseUnit(product.nutritionBaseUnit);
    setSearchQuery(product.name);
    setAddDialogMode('search');
  }

  function handleBarcodeLookup() {
    if (!newProductBarcode.trim()) return;
    setBarcodeLookupError('');
    barcodeLookupMutation.mutate(newProductBarcode.trim());
  }

  function handleCreateProduct(e: FormEvent) {
    e.preventDefault();
    const nf: Record<string, number> = {};
    if (newProductCalories) nf.calories = parseFloat(newProductCalories);
    if (newProductFat) nf.fat = parseFloat(newProductFat);
    if (newProductCarbs) nf.carbs = parseFloat(newProductCarbs);
    if (newProductProtein) nf.protein = parseFloat(newProductProtein);
    if (newProductSugars) nf.sugars = parseFloat(newProductSugars);
    if (newProductFiber) nf.fiber = parseFloat(newProductFiber);
    if (newProductSalt) nf.salt = parseFloat(newProductSalt);

    const baseAmount = parseFloat(newProductBaseAmount);

    createProductMutation.mutate({
      name: newProductName,
      barcode: newProductBarcode || undefined,
      brand: newProductBrand || undefined,
      nutritionBaseAmount: baseAmount && baseAmount !== 100 ? baseAmount : undefined,
      nutritionBaseUnit: newProductBaseUnit !== 'g' ? newProductBaseUnit : undefined,
      nutritionalFacts: Object.keys(nf).length > 0 ? nf : undefined,
    });
  }

  function handleAddEntry(e: FormEvent) {
    e.preventDefault();
    createEntryMutation.mutate({
      date: selectedDate,
      mealSlot: addMealSlot,
      productId: entryType === 'product' ? selectedProductId : undefined,
      recipeId: entryType === 'recipe' ? selectedRecipeId : undefined,
      quantity: parseFloat(entryQuantity),
      servingUnitId: entryServingUnitId || undefined,
      unit: entryUnit || undefined,
      notes: entryNotes || undefined,
    });
  }

  function handleCreateUnit(e: FormEvent) {
    e.preventDefault();
    createUnitMutation.mutate({
      productId: selectedProductId,
      name: unitName,
      baseUnitEquivalent: parseFloat(unitGrams),
    });
  }

  function handleUnitSelection(value: string) {
    // Check if it's a serving unit ID (uuid) or a standard unit code
    const isServingUnit = servingUnits?.some((u) => u.id === value);
    if (isServingUnit) {
      setEntryServingUnitId(value);
      setEntryUnit('');
    } else if (value) {
      setEntryUnit(value);
      setEntryServingUnitId('');
    } else {
      // Empty = product's base unit
      setEntryUnit('');
      setEntryServingUnitId('');
    }
  }

  function handleEditUnitSelection(value: string) {
    const isServingUnit = editServingUnits?.some((u) => u.id === value);
    if (isServingUnit) {
      setEditServingUnitId(value);
      setEditUnit('');
    } else if (value) {
      setEditUnit(value);
      setEditServingUnitId('');
    } else {
      setEditUnit('');
      setEditServingUnitId('');
    }
  }

  function openEditDialog(entry: IntakeEntryResponse) {
    setEditingEntry(entry);
    setEditQuantity(String(entry.quantity));
    setEditServingUnitId(entry.servingUnitId ?? '');
    setEditUnit(entry.unit ?? '');
    setEditMealSlot(entry.mealSlot);
  }

  function handleEditEntry(e: FormEvent) {
    e.preventDefault();
    if (!editingEntry) return;
    updateEntryMutation.mutate({
      id: editingEntry.id,
      mealSlot: editMealSlot,
      quantity: parseFloat(editQuantity),
      servingUnitId: editServingUnitId || null,
      unit: editUnit || null,
    });
  }

  function toggleMealCollapse(slot: MealSlot) {
    setCollapsedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  function handleNewUnitDropdownChange(value: string) {
    setUnitDropdownValue(value);
    if (value === 'custom') {
      setUnitName('');
    } else {
      const unitDef = UNITS[value];
      if (unitDef) {
        setUnitName(unitDef.name);
      }
    }
  }

  const totalNutrition = dailyLog?.totalNutrition;

  // Current selected unit value for the dropdown (servingUnitId takes precedence)
  const currentUnitValue = entryServingUnitId || entryUnit || '';
  const currentEditUnitValue = editServingUnitId || editUnit || '';

  // ==================== Render: Add dialog content by mode ====================

  function renderSearchMode() {
    return (
      <form onSubmit={handleAddEntry}>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={entryType === 'product' ? 'default' : 'outline'}
              onClick={() => {
                setEntryType('product');
                setSearchQuery('');
                setSelectedRecipeId('');
                setSelectedRecipeName('');
                setEntryQuantity('100');
                setEntryServingUnitId('');
                setEntryUnit('');
              }}
            >
              Product
            </Button>
            <Button
              type="button"
              size="sm"
              variant={entryType === 'recipe' ? 'default' : 'outline'}
              onClick={() => {
                setEntryType('recipe');
                setSearchQuery('');
                setSelectedProductId('');
                setSelectedProductName('');
                setSelectedProductBaseUnit('g');
                setEntryQuantity('1');
                setEntryServingUnitId('');
                setEntryUnit('');
              }}
            >
              Recipe
            </Button>
          </div>

          {/* Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {entryType === 'product' ? 'Search Product' : 'Search Recipe'}
            </label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={entryType === 'product' ? 'Search products...' : 'Search recipes...'}
            />
            {entryType === 'product' && !selectedProductId && (
              <>
                {productResults && productResults.length > 0 && (
                  <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setSelectedProductName(p.name);
                          setSelectedProductBaseUnit(p.nutritionBaseUnit);
                          setSearchQuery(p.name);
                        }}
                      >
                        {p.name} {p.brand && `(${p.brand})`}
                      </button>
                    ))}
                  </div>
                )}
                <Button type="button" size="sm" variant="outline" onClick={openNewProductMode}>
                  + New Product
                </Button>
              </>
            )}
            {entryType === 'recipe' && filteredRecipes && filteredRecipes.length > 0 && !selectedRecipeId && (
              <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                {filteredRecipes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedRecipeId(r.id);
                      setSelectedRecipeName(r.name);
                      setSearchQuery(r.name);
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            {(selectedProductId || selectedRecipeId) && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Selected: {selectedProductName || selectedRecipeName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedProductId('');
                    setSelectedProductName('');
                    setSelectedProductBaseUnit('g');
                    setSelectedRecipeId('');
                    setSelectedRecipeName('');
                    setSearchQuery('');
                    setEntryServingUnitId('');
                    setEntryUnit('');
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {entryType === 'recipe' ? 'Servings' : 'Quantity'}
              </label>
              <Input
                type="number"
                step="any"
                min="0.1"
                value={entryQuantity}
                onChange={(e) => setEntryQuantity(e.target.value)}
                required
              />
            </div>
            {entryType === 'product' && selectedProductId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Unit</label>
                <div className="flex gap-1">
                  <Select
                    value={currentUnitValue}
                    onChange={(e) => handleUnitSelection(e.target.value)}
                    className="flex-1"
                  >
                    {/* Same-family standard units */}
                    <optgroup label="Standard units">
                      {compatibleUnits.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </optgroup>
                    {/* Product serving units (cross-family & custom) */}
                    {servingUnits && servingUnits.length > 0 && (
                      <optgroup label="Custom serving units">
                        {servingUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.baseUnitEquivalent}{selectedProductBaseUnit})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddDialogMode('newUnit');
                      setUnitName('');
                      setUnitGrams('');
                      setUnitDropdownValue('custom');
                    }}
                    title="Add conversion"
                  >
                    +
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Input
              value={entryNotes}
              onChange={(e) => setEntryNotes(e.target.value)}
              placeholder="e.g., with butter"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={closeAddDialog}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              createEntryMutation.isPending ||
              (entryType === 'product' && !selectedProductId) ||
              (entryType === 'recipe' && !selectedRecipeId)
            }
          >
            Add
          </Button>
        </DialogFooter>
      </form>
    );
  }

  function renderNewProductMode() {
    return (
      <form onSubmit={handleCreateProduct}>
        <div className="space-y-4">
          {/* Barcode lookup */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Barcode (optional)</label>
            <div className="flex gap-2">
              <Input
                value={newProductBarcode}
                onChange={(e) => setNewProductBarcode(e.target.value)}
                placeholder="Scan or type barcode"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleBarcodeLookup}
                disabled={barcodeLookupMutation.isPending || !newProductBarcode.trim()}
              >
                {barcodeLookupMutation.isPending ? 'Looking up...' : 'Lookup'}
              </Button>
            </div>
            {barcodeLookupError && (
              <p className="text-xs text-destructive">{barcodeLookupError}</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name *</label>
            <Input
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Product name"
              required
            />
          </div>

          {/* Brand with autocomplete */}
          <div className="space-y-2 relative">
            <label className="text-sm font-medium">Brand</label>
            <Input
              value={newProductBrand}
              onChange={(e) => {
                setNewProductBrand(e.target.value);
                setBrandSearch(e.target.value);
                setShowBrandDropdown(true);
              }}
              onFocus={() => setShowBrandDropdown(true)}
              onBlur={() => setTimeout(() => setShowBrandDropdown(false), 200)}
              placeholder="Brand name"
            />
            {showBrandDropdown && brandResults && brandResults.length > 0 && (
              <div className="absolute z-10 w-full border border-border rounded-md bg-card max-h-32 overflow-y-auto shadow-md">
                {brandResults.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setNewProductBrand(b.name);
                      setBrandSearch(b.name);
                      setShowBrandDropdown(false);
                    }}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Nutrition base + facts */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Nutrition per</label>
              <Input
                type="number"
                step="any"
                min="0.1"
                value={newProductBaseAmount}
                onChange={(e) => setNewProductBaseAmount(e.target.value)}
                className="w-20"
              />
              <Select
                value={newProductBaseUnit}
                onChange={(e) => setNewProductBaseUnit(e.target.value)}
                className="w-24"
              >
                {ALL_UNITS.map((u) => (
                  <option key={u.code} value={u.code}>{u.code}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Calories (kcal)</label>
                <Input type="number" step="any" min="0" value={newProductCalories} onChange={(e) => setNewProductCalories(e.target.value)} placeholder="-" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Protein (g)</label>
                <Input type="number" step="any" min="0" value={newProductProtein} onChange={(e) => setNewProductProtein(e.target.value)} placeholder="-" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Carbs (g)</label>
                <Input type="number" step="any" min="0" value={newProductCarbs} onChange={(e) => setNewProductCarbs(e.target.value)} placeholder="-" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fat (g)</label>
                <Input type="number" step="any" min="0" value={newProductFat} onChange={(e) => setNewProductFat(e.target.value)} placeholder="-" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Sugars (g)</label>
                <Input type="number" step="any" min="0" value={newProductSugars} onChange={(e) => setNewProductSugars(e.target.value)} placeholder="-" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fiber (g)</label>
                <Input type="number" step="any" min="0" value={newProductFiber} onChange={(e) => setNewProductFiber(e.target.value)} placeholder="-" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Salt (g)</label>
                <Input type="number" step="any" min="0" value={newProductSalt} onChange={(e) => setNewProductSalt(e.target.value)} placeholder="-" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setAddDialogMode('search')}>
            Back
          </Button>
          <Button type="submit" disabled={createProductMutation.isPending || !newProductName.trim()}>
            {createProductMutation.isPending ? 'Creating...' : 'Create & Select'}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  function renderNewUnitMode() {
    const selectedUnitLabel = unitDropdownValue !== 'custom' && UNITS[unitDropdownValue]
      ? UNITS[unitDropdownValue].name
      : unitName || 'unit';

    return (
      <form onSubmit={handleCreateUnit}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define a conversion for <strong>{selectedProductName}</strong>
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Unit type</label>
            <Select
              value={unitDropdownValue}
              onChange={(e) => handleNewUnitDropdownChange(e.target.value)}
            >
              {otherFamilyUnits.map((u) => (
                <option key={u.code} value={u.code}>{u.name} ({u.code})</option>
              ))}
              <option value="custom">Custom...</option>
            </Select>
          </div>
          {unitDropdownValue === 'custom' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Custom unit name</label>
              <Input
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="e.g., slice, bowl, cookie"
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {selectedProductBaseUnit} per 1 {selectedUnitLabel}
            </label>
            <Input
              type="number"
              step="any"
              min="0.1"
              value={unitGrams}
              onChange={(e) => setUnitGrams(e.target.value)}
              placeholder="e.g., 30"
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setAddDialogMode('search')}>
            Back
          </Button>
          <Button type="submit" disabled={createUnitMutation.isPending || (unitDropdownValue === 'custom' && !unitName.trim())}>
            Create Unit
          </Button>
        </DialogFooter>
      </form>
    );
  }

  const addDialogTitles: Record<AddDialogMode, string> = {
    search: `Add to ${MEAL_SLOT_LABELS[addMealSlot]}`,
    newProduct: 'New Product',
    newUnit: 'New Serving Unit',
  };

  // ==================== Main render ====================

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Daily Intake</h1>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-center gap-3">
        <Button size="sm" variant="outline" onClick={() => navigateDate(-1)}>
          Prev
        </Button>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-auto"
        />
        <Button size="sm" variant="outline" onClick={() => setSelectedDate(toDateString(new Date()))}>
          Today
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigateDate(1)}>
          Next
        </Button>
      </div>

      {/* Daily Totals */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{fmtN(totalNutrition?.calories)}</div>
              <div className="text-xs text-muted-foreground">Calories</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmtN(totalNutrition?.protein)}g</div>
              <div className="text-xs text-muted-foreground">Protein</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmtN(totalNutrition?.carbs)}g</div>
              <div className="text-xs text-muted-foreground">Carbs</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmtN(totalNutrition?.fat)}g</div>
              <div className="text-xs text-muted-foreground">Fat</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meal Sections */}
      {dailyLog?.meals.map((meal) => {
        const isCollapsed = collapsedMeals.has(meal.mealSlot);
        const mealCals = meal.nutrition.calories ?? 0;

        return (
          <Card key={meal.mealSlot}>
            <div
              className="flex items-center justify-between p-4 cursor-pointer"
              onClick={() => toggleMealCollapse(meal.mealSlot)}
            >
              <div className="flex items-center gap-3">
                <h2 className="font-semibold">{MEAL_SLOT_LABELS[meal.mealSlot]}</h2>
                <span className="text-sm text-muted-foreground">{fmtN(mealCals)} kcal</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAddDialog(meal.mealSlot);
                  }}
                >
                  + Add
                </Button>
                <span className="text-muted-foreground text-sm">{isCollapsed ? '+' : '-'}</span>
              </div>
            </div>

            {!isCollapsed && (
              <CardContent className="pt-0 pb-4 px-4">
                {meal.entries.length > 0 ? (
                  <div className="space-y-2">
                    {meal.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between py-2 border-b border-border last:border-0"
                      >
                        <div className="flex-1 cursor-pointer" onClick={() => openEditDialog(entry)}>
                          <div className="font-medium text-sm">
                            {entry.productName ?? entry.recipeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.quantity}{' '}
                            {entry.servingUnitName
                              ? entry.servingUnitName
                              : entry.unit
                                ? entry.unit
                                : entry.productId
                                  ? (entry.calculatedUnit || 'g')
                                  : 'serving(s)'}
                            {entry.calculatedAmount != null && entry.servingUnitName && (
                              <> ({entry.calculatedAmount}{entry.calculatedUnit || 'g'})</>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            {fmtN(entry.nutrition?.calories)} kcal
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteEntryMutation.mutate(entry.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            X
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">No entries yet</p>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Single Add Dialog — switches content by mode */}
      <Dialog open={showAddDialog} onClose={closeAddDialog} className={addDialogMode === 'newProduct' ? 'max-w-xl' : ''}>
        <DialogHeader>
          <DialogTitle>{addDialogTitles[addDialogMode]}</DialogTitle>
        </DialogHeader>
        {addDialogMode === 'search' && renderSearchMode()}
        {addDialogMode === 'newProduct' && renderNewProductMode()}
        {addDialogMode === 'newUnit' && renderNewUnitMode()}
      </Dialog>

      {/* Edit Entry Dialog (separate, doesn't overlap) */}
      <Dialog open={!!editingEntry} onClose={() => setEditingEntry(null)}>
        <DialogHeader>
          <DialogTitle>Edit: {editingEntry?.productName ?? editingEntry?.recipeName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleEditEntry}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Meal</label>
              <Select value={editMealSlot} onChange={(e) => setEditMealSlot(e.target.value as MealSlot)}>
                {ALL_MEAL_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{MEAL_SLOT_LABELS[slot]}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {editingEntry?.recipeId ? 'Servings' : 'Quantity'}
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0.1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  required
                />
              </div>
              {editingEntry?.productId && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unit</label>
                  <Select value={currentEditUnitValue} onChange={(e) => handleEditUnitSelection(e.target.value)}>
                    <optgroup label="Standard units">
                      {editCompatibleUnits.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </optgroup>
                    {editServingUnits && editServingUnits.length > 0 && (
                      <optgroup label="Custom serving units">
                        {editServingUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.baseUnitEquivalent}{editProductBaseUnit})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </div>
              )}
            </div>
            {editingEntry?.nutrition && (
              <div className="text-xs text-muted-foreground grid grid-cols-4 gap-2 bg-muted/50 rounded p-2">
                <div>Cal: {fmtN(editingEntry.nutrition.calories)}</div>
                <div>P: {fmtN(editingEntry.nutrition.protein)}g</div>
                <div>C: {fmtN(editingEntry.nutrition.carbs)}g</div>
                <div>F: {fmtN(editingEntry.nutrition.fat)}g</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditingEntry(null)}>Cancel</Button>
            <Button type="submit" disabled={updateEntryMutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
