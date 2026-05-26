import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import type {
  PrepareRecipeInput,
  RecipePreparationResponse,
  StorageSpaceResponse,
  NutritionalFacts,
  RecipeAvailabilityResponse,
  RecipeDetailResponse,
  RecipeResponse,
  RecipeSuggestionResponse,
} from '@personal-budget/shared';
import {
  RecipeForm,
  recipeToFormValues,
  type RecipeFormSubmitPayload,
} from './recipe-form';
import { NutritionLabel } from './nutrition-label';
import { useNutritionMode } from '@/hooks/use-nutrition-mode';

export function RecipesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'all' | 'suggestions'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [labelRecipeId, setLabelRecipeId] = useState<string | null>(null);
  const [prepareRecipeId, setPrepareRecipeId] = useState<string | null>(null);
  const [nutritionMode, setNutritionMode] = useNutritionMode();

  const { data: availability } = useQuery({
    queryKey: ['recipes', 'availability'],
    // Bulk endpoint — one round-trip; cheap server-side via batched joins.
    queryFn: () =>
      api
        .get<Record<string, RecipeAvailabilityResponse>>('/recipes/availability')
        .then((r) => r.data),
  });

  const { data: recipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get<RecipeResponse[]>('/recipes').then((r) => r.data),
  });

  const { data: suggestions } = useQuery({
    queryKey: ['recipes', 'suggestions'],
    queryFn: () => api.get<RecipeSuggestionResponse[]>('/recipes/suggestions').then((r) => r.data),
    enabled: tab === 'suggestions',
  });

  const detailId = editingRecipeId ?? labelRecipeId ?? prepareRecipeId ?? selectedRecipeId;
  const { data: recipeDetail } = useQuery({
    queryKey: ['recipes', detailId],
    queryFn: () => api.get<RecipeDetailResponse>(`/recipes/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: (data: RecipeFormSubmitPayload) => api.post('/recipes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecipeFormSubmitPayload }) =>
      api.patch(`/recipes/${id}`, data),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipes', vars.id] });
      setEditingRecipeId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setSelectedRecipeId(null);
    },
  });

  function renderNutrition(nf: NutritionalFacts, label: string) {
    return (
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {[
            { label: 'Calories', value: nf.calories, unit: 'kcal' },
            { label: 'Protein', value: nf.protein, unit: 'g' },
            { label: 'Carbs', value: nf.carbs, unit: 'g' },
            { label: 'Fat', value: nf.fat, unit: 'g' },
          ].map(({ label, value, unit }) => (
            <div key={label} className="text-center p-2 bg-muted rounded">
              <div className="font-medium">
                {value ?? '-'}
                {value !== undefined ? unit : ''}
              </div>
              <div className="text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 sm:h-7 sm:w-7 text-fitness" />
          Recipes
        </h1>
        <Button onClick={() => setShowCreate(true)}>New Recipe</Button>
      </div>

      {/* Tabs + nutrition mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')}>
            All Recipes
          </Button>
          <Button size="sm" variant={tab === 'suggestions' ? 'default' : 'outline'} onClick={() => setTab('suggestions')}>
            Suggestions
          </Button>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground mr-1">Show nutrition</span>
          <Button
            size="sm"
            variant={nutritionMode === 'per100g' ? 'default' : 'outline'}
            onClick={() => setNutritionMode('per100g')}
          >
            Per 100 g
          </Button>
          <Button
            size="sm"
            variant={nutritionMode === 'perServing' ? 'default' : 'outline'}
            onClick={() => setNutritionMode('perServing')}
          >
            Per serving
          </Button>
        </div>
      </div>

      {/* Recipes List */}
      {tab === 'all' && (
        <div className="grid gap-4 md:grid-cols-2">
          {recipes?.map((recipe) => (
            <Card
              key={recipe.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedRecipeId(recipe.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{recipe.name}</h3>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <AvailabilityBadge avail={availability?.[recipe.id]} />
                    {nutritionMode === 'per100g'
                      ? recipe.caloriesPer100g != null && (
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {recipe.caloriesPer100g} kcal/100g
                          </Badge>
                        )
                      : recipe.caloriesPerServing != null && (
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {recipe.caloriesPerServing} kcal/{recipe.servingUnit ?? 'serving'}
                          </Badge>
                        )}
                  </div>
                </div>
                {recipe.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{recipe.description}</p>}
                <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                  <span>
                    {recipe.servings} {recipe.servingUnit ?? 'serving'}
                    {recipe.servings === 1 ? '' : 's'}
                    {recipe.totalWeightGrams && ` · ${recipe.totalWeightGrams}g`}
                  </span>
                  {recipe.prepTime && <span>Prep: {recipe.prepTime}min</span>}
                  {recipe.cookTime && <span>Cook: {recipe.cookTime}min</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {(!recipes || recipes.length === 0) && (
            <p className="text-sm text-muted-foreground col-span-2 text-center py-8">No recipes yet. Create your first recipe!</p>
          )}
        </div>
      )}

      {/* Suggestions */}
      {tab === 'suggestions' && (
        <div className="grid gap-4 md:grid-cols-2">
          {suggestions?.map((recipe) => (
            <Card
              key={recipe.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedRecipeId(recipe.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{recipe.name}</h3>
                  <Badge variant={recipe.matchScore === 1 ? 'success' : recipe.matchScore >= 0.7 ? 'warning' : 'secondary'}>
                    {Math.round(recipe.matchScore * 100)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {recipe.availableIngredients}/{recipe.totalIngredients} ingredients available
                </p>
                {recipe.missingIngredients.length > 0 && (
                  <p className="text-xs text-destructive mt-1">
                    Missing: {recipe.missingIngredients.map((m) => m.productName).join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {(!suggestions || suggestions.length === 0) && (
            <p className="text-sm text-muted-foreground col-span-2 text-center py-8">Add recipes and inventory items to get suggestions.</p>
          )}
        </div>
      )}

      {/* Recipe Detail Dialog */}
      <Dialog
        open={!!selectedRecipeId && !editingRecipeId && !labelRecipeId && !prepareRecipeId && !!recipeDetail}
        onClose={() => setSelectedRecipeId(null)}
        className="max-w-2xl"
      >
        {recipeDetail && (
          <>
            <DialogHeader>
              <DialogTitle>{recipeDetail.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {recipeDetail.description && <p className="text-sm text-muted-foreground">{recipeDetail.description}</p>}
              {recipeDetail.externalUrl && (
                <a
                  href={recipeDetail.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline break-all"
                >
                  ↗ {recipeDetail.externalUrl}
                </a>
              )}

              <div className="text-sm">
                <div className="font-medium">
                  Makes {recipeDetail.servings} {recipeDetail.servingUnit ?? 'serving'}
                  {recipeDetail.servings === 1 ? '' : 's'}
                  {recipeDetail.servingWeightGrams != null && (
                    <>
                      {' '}× {recipeDetail.servingWeightGrams} g
                      {recipeDetail.totalWeightGrams != null && (
                        <span className="text-muted-foreground">
                          {' '}= {recipeDetail.totalWeightGrams} g total
                        </span>
                      )}
                    </>
                  )}
                </div>
                {(recipeDetail.prepTime || recipeDetail.cookTime) && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {recipeDetail.prepTime && <span>Prep: {recipeDetail.prepTime} min</span>}
                    {recipeDetail.prepTime && recipeDetail.cookTime && <span> · </span>}
                    {recipeDetail.cookTime && <span>Cook: {recipeDetail.cookTime} min</span>}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Ingredients</h4>
                  <AvailabilityBadge avail={availability?.[recipeDetail.id]} />
                </div>
                <div className="space-y-1">
                  {recipeDetail.ingredients.map((ing) => {
                    const ingAvail = availability?.[recipeDetail.id]?.ingredients.find(
                      (a) => a.ingredientId === ing.id,
                    );
                    return (
                      <div
                        key={ing.id}
                        className="text-sm flex justify-between items-center gap-2"
                      >
                        <span className="min-w-0 truncate">{ing.productName}</span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{ing.quantity} {ing.unit}</span>
                          {ingAvail && <IngredientStatus avail={ingAvail} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {recipeDetail.instructions && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Instructions</h4>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {recipeDetail.instructions}
                  </p>
                </div>
              )}

              {renderNutrition(recipeDetail.totalNutrition, 'Total nutrition')}
              {nutritionMode === 'per100g' && recipeDetail.per100gNutrition
                ? renderNutrition(recipeDetail.per100gNutrition, 'Per 100 g')
                : renderNutrition(
                    recipeDetail.perServingNutrition,
                    `Per ${recipeDetail.servingUnit ?? 'serving'}${recipeDetail.servingWeightGrams != null ? ` (${recipeDetail.servingWeightGrams} g)` : ''}`,
                  )}
              {nutritionMode === 'per100g' && !recipeDetail.per100gNutrition && (
                <p className="text-xs text-muted-foreground">
                  Set the recipe yield weight to see per-100 g values.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete recipe "${recipeDetail.name}"?`)) {
                    deleteMutation.mutate(recipeDetail.id);
                  }
                }}
              >
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLabelRecipeId(recipeDetail.id);
                  setSelectedRecipeId(null);
                }}
              >
                Nutrition label
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingRecipeId(recipeDetail.id);
                  setSelectedRecipeId(null);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setPrepareRecipeId(recipeDetail.id);
                  setSelectedRecipeId(null);
                }}
              >
                🍳 Prepare
              </Button>
              <Button variant="outline" onClick={() => setSelectedRecipeId(null)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {/* Create Recipe Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} className="max-w-2xl">
        <DialogHeader><DialogTitle>New Recipe</DialogTitle></DialogHeader>
        <RecipeForm
          submitLabel={createMutation.isPending ? 'Creating...' : 'Create'}
          submitting={createMutation.isPending}
          onCancel={() => setShowCreate(false)}
          onSubmit={(data) => createMutation.mutate(data)}
        />
      </Dialog>

      {/* Edit Recipe Dialog */}
      <Dialog
        open={!!editingRecipeId && !!recipeDetail}
        onClose={() => setEditingRecipeId(null)}
        className="max-w-2xl"
      >
        {recipeDetail && editingRecipeId === recipeDetail.id && (
          <>
            <DialogHeader>
              <DialogTitle>Edit Recipe</DialogTitle>
            </DialogHeader>
            <RecipeForm
              key={`edit-${recipeDetail.id}`}
              initialValues={recipeToFormValues(recipeDetail)}
              submitLabel={updateMutation.isPending ? 'Saving...' : 'Save'}
              submitting={updateMutation.isPending}
              onCancel={() => setEditingRecipeId(null)}
              onSubmit={(data) => updateMutation.mutate({ id: recipeDetail.id, data })}
            />
          </>
        )}
      </Dialog>

      {/* Nutrition Label Dialog */}
      <Dialog
        open={!!labelRecipeId && !!recipeDetail}
        onClose={() => setLabelRecipeId(null)}
      >
        {recipeDetail && labelRecipeId === recipeDetail.id && (
          <>
            <DialogHeader>
              <DialogTitle>{recipeDetail.name} — Nutrition label</DialogTitle>
            </DialogHeader>
            <NutritionLabel recipe={recipeDetail} mode={nutritionMode} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setLabelRecipeId(null)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {/* Prepare Recipe Dialog */}
      <PrepareRecipeDialog
        open={!!prepareRecipeId && !!recipeDetail}
        recipe={recipeDetail && prepareRecipeId === recipeDetail.id ? recipeDetail : null}
        availability={prepareRecipeId ? availability?.[prepareRecipeId] ?? null : null}
        onClose={() => setPrepareRecipeId(null)}
      />
    </div>
  );
}

function AvailabilityBadge({ avail }: { avail: RecipeAvailabilityResponse | undefined }) {
  if (!avail || avail.ingredients.length === 0) return null;
  if (avail.canCook) {
    return (
      <Badge variant="success" className="text-xs whitespace-nowrap">
        Ready to cook
      </Badge>
    );
  }
  const short = avail.ingredients.filter((i) => i.status === 'short').length;
  const unknown = avail.ingredients.filter((i) => i.status === 'unknown').length;
  if (short === 0 && unknown > 0) {
    return (
      <Badge variant="outline" className="text-xs whitespace-nowrap" title="Some ingredients use units we can't compare against storage.">
        {unknown} unknown
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="text-xs whitespace-nowrap">
      {short} short
      {unknown > 0 ? ` · ${unknown} unknown` : ''}
    </Badge>
  );
}

function IngredientStatus({
  avail,
}: {
  avail: RecipeAvailabilityResponse['ingredients'][number];
}) {
  if (avail.status === 'sufficient') {
    return (
      <Badge variant="success" className="text-xs" title={`Have ${avail.have.toFixed(1)} ${avail.canonicalUnit}`}>
        ✓
      </Badge>
    );
  }
  if (avail.status === 'short') {
    return (
      <Badge
        variant="warning"
        className="text-xs"
        title={`Have ${avail.have.toFixed(1)} ${avail.canonicalUnit}, need ${avail.needed} ${avail.neededUnit}`}
      >
        Need {Number(avail.missing.toFixed(2))} {avail.canonicalUnit} more
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs" title="Storage entries use a unit we can't convert against the recipe's unit.">
      ?
    </Badge>
  );
}

interface PrepareRecipeDialogProps {
  open: boolean;
  recipe: RecipeDetailResponse | null;
  /** Availability at 1× scale — we apply the chosen scale client-side. */
  availability: RecipeAvailabilityResponse | null;
  onClose: () => void;
}

function PrepareRecipeDialog({ open, recipe, availability, onClose }: PrepareRecipeDialogProps) {
  const queryClient = useQueryClient();
  const [scale, setScale] = useState('1');
  const [allowShortage, setAllowShortage] = useState(false);
  const [storeLeftovers, setStoreLeftovers] = useState(true);
  const [storageSpaceId, setStorageSpaceId] = useState('');
  const [storedQuantity, setStoredQuantity] = useState('');
  const [storedExpiry, setStoredExpiry] = useState('');
  const [notes, setNotes] = useState('');

  const { data: storageSpaces } = useQuery({
    queryKey: ['storage', 'spaces'],
    queryFn: () =>
      api.get<StorageSpaceResponse[]>('/storage/spaces').then((r) => r.data),
    enabled: open,
  });

  // Reset form whenever the dialog opens for a fresh recipe.
  useEffect(() => {
    if (!open || !recipe) return;
    setScale('1');
    setAllowShortage(false);
    setStoreLeftovers(true);
    setStorageSpaceId('');
    setStoredQuantity('');
    setStoredExpiry('');
    setNotes('');
  }, [open, recipe?.id]);

  const scaleNum = Math.max(0, parseFloat(scale) || 0);
  const defaultStoredQty = scaleNum * (recipe?.servings ?? 1);

  // Re-evaluate shortages at the chosen scale against the 1× availability.
  const shortages =
    availability?.ingredients
      .map((ing) => {
        const needed = ing.needed * scaleNum;
        const isUnknown = ing.status === 'unknown';
        const isShort = !isUnknown && needed > ing.have + 1e-9;
        return { ing, needed, isShort, isUnknown };
      })
      .filter((row) => row.isShort || row.isUnknown) ?? [];
  const hasShortages = shortages.length > 0;

  // Pre-check "allow shortage" the moment a shortfall appears at this scale.
  useEffect(() => {
    setAllowShortage(hasShortages);
  }, [hasShortages]);

  const prepareMutation = useMutation({
    mutationFn: (input: PrepareRecipeInput) =>
      api.post<RecipePreparationResponse>(`/recipes/${recipe!.id}/prepare`, input),
    onSuccess: () => {
      // Stock and recipe availability both changed.
      queryClient.invalidateQueries({ queryKey: ['storage'] });
      queryClient.invalidateQueries({ queryKey: ['recipes', 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!recipe || scaleNum <= 0) return;
    const storedQtyNum = storedQuantity ? parseFloat(storedQuantity) : NaN;
    const payload: PrepareRecipeInput = {
      scale: scaleNum,
      allowShortage,
      notes: notes.trim() || undefined,
    };
    if (storeLeftovers && storageSpaceId) {
      payload.storageSpaceId = storageSpaceId;
      payload.storedQuantity = Number.isFinite(storedQtyNum) && storedQtyNum > 0 ? storedQtyNum : undefined;
      payload.storedUnit = 'serving';
      payload.storedExpiryDate = storedExpiry
        ? new Date(storedExpiry + 'T12:00:00Z').toISOString()
        : null;
    }
    prepareMutation.mutate(payload);
  }

  const submitDisabled =
    prepareMutation.isPending ||
    scaleNum <= 0 ||
    (hasShortages && !allowShortage) ||
    (storeLeftovers && !storageSpaceId);

  if (!open || !recipe) {
    return <Dialog open={false} onClose={onClose}><div /></Dialog>;
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Prepare: {recipe.name}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Scale */}
          <div className="space-y-2">
            <label className="text-sm font-medium">How much did you make?</label>
            <div className="flex flex-wrap items-center gap-2">
              {[0.5, 1, 1.5, 2].map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={parseFloat(scale) === s ? 'default' : 'outline'}
                  onClick={() => setScale(String(s))}
                >
                  {s}× ({s * recipe.servings} {recipe.servingUnit ?? 'serving'}
                  {s * recipe.servings === 1 ? '' : 's'})
                </Button>
              ))}
              <span className="text-xs text-muted-foreground">or</span>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={scale}
                onChange={(e) => setScale(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">× the recipe</span>
            </div>
          </div>

          {/* Ingredient preview */}
          {availability && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Will be consumed</label>
              <div className="space-y-1 rounded border border-border p-2 text-sm">
                {availability.ingredients.map((ing) => {
                  const needed = ing.needed * scaleNum;
                  const isUnknown = ing.status === 'unknown';
                  const isShort = !isUnknown && needed > ing.have + 1e-9;
                  return (
                    <div
                      key={ing.ingredientId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">{ing.productName}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className={isShort ? 'text-destructive font-medium' : ''}>
                          {Number(needed.toFixed(2))} {ing.neededUnit}
                        </span>
                        <span>/</span>
                        <span>
                          have {Number(ing.have.toFixed(2))} {ing.canonicalUnit}
                        </span>
                        {isShort && <Badge variant="warning" className="text-xs">short</Badge>}
                        {isUnknown && <Badge variant="outline" className="text-xs">?</Badge>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Allow shortage */}
          {hasShortages && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={allowShortage}
                onChange={(e) => setAllowShortage(e.target.checked)}
              />
              <span>
                <span className="font-medium">Cook anyway — leave shortages at 0 in stock</span>
                <span className="block text-xs text-muted-foreground">
                  Inventory never goes negative. Short ingredients get drained to 0 and the rest
                  is deducted as normal.
                </span>
              </span>
            </label>
          )}

          {/* Store leftovers */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={storeLeftovers}
                onChange={(e) => setStoreLeftovers(e.target.checked)}
              />
              <span className="font-medium">Save leftovers to storage</span>
            </label>
            {storeLeftovers && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-6">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Storage space</label>
                  <Select
                    value={storageSpaceId}
                    onChange={(e) => setStorageSpaceId(e.target.value)}
                  >
                    <option value="">— Pick one —</option>
                    {storageSpaces?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Servings (default {Number(defaultStoredQty.toFixed(2))})
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={storedQuantity}
                    onChange={(e) => setStoredQuantity(e.target.value)}
                    placeholder={String(defaultStoredQty)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Expires (optional)</label>
                  <Input
                    type="date"
                    value={storedExpiry}
                    onChange={(e) => setStoredExpiry(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any tweaks you made…"
            />
          </div>

          {prepareMutation.error && (
            <p className="text-sm text-destructive">
              {(prepareMutation.error as { response?: { data?: { error?: string } } }).response
                ?.data?.error || 'Could not record the preparation'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {prepareMutation.isPending ? 'Saving…' : 'Done cooking'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
