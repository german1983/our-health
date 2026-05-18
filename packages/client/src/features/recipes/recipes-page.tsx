import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { UNITS } from '@personal-budget/shared';
import type {
  RecipeResponse,
  RecipeDetailResponse,
  RecipeSuggestionResponse,
  ProductResponse,
  NutritionalFacts,
} from '@personal-budget/shared';

const ALL_UNITS = Object.values(UNITS);

interface IngredientForm {
  productId: string;
  productName: string;
  quantity: string;
  unit: string;
  notes: string;
}

export function RecipesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'all' | 'suggestions'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  // Create form
  const [recipeName, setRecipeName] = useState('');
  const [recipeDesc, setRecipeDesc] = useState('');
  const [recipeServings, setRecipeServings] = useState('4');
  const [recipePrepTime, setRecipePrepTime] = useState('');
  const [recipeCookTime, setRecipeCookTime] = useState('');
  const [ingredients, setIngredients] = useState<IngredientForm[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');

  const { data: recipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get<RecipeResponse[]>('/recipes').then((r) => r.data),
  });

  const { data: suggestions } = useQuery({
    queryKey: ['recipes', 'suggestions'],
    queryFn: () => api.get<RecipeSuggestionResponse[]>('/recipes/suggestions').then((r) => r.data),
    enabled: tab === 'suggestions',
  });

  const { data: recipeDetail } = useQuery({
    queryKey: ['recipes', selectedRecipeId],
    queryFn: () => api.get<RecipeDetailResponse>(`/recipes/${selectedRecipeId}`).then((r) => r.data),
    enabled: !!selectedRecipeId,
  });

  const { data: productResults } = useQuery({
    queryKey: ['products', 'search', ingredientSearch],
    queryFn: () =>
      api.get<{ items: ProductResponse[] }>('/products', { params: { query: ingredientSearch } }).then((r) => r.data.items),
    enabled: ingredientSearch.length > 1,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      servings: number;
      prepTime?: number;
      cookTime?: number;
      ingredients: { productId: string; quantity: number; unit: string; notes?: string }[];
    }) => api.post('/recipes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setShowCreate(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setSelectedRecipeId(null);
    },
  });

  function resetForm() {
    setRecipeName('');
    setRecipeDesc('');
    setRecipeServings('4');
    setRecipePrepTime('');
    setRecipeCookTime('');
    setIngredients([]);
  }

  function addIngredient(product: ProductResponse) {
    setIngredients([...ingredients, {
      productId: product.id,
      productName: product.name,
      quantity: '100',
      unit: product.nutritionBaseUnit || 'g',
      notes: '',
    }]);
    setIngredientSearch('');
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      name: recipeName,
      description: recipeDesc || undefined,
      servings: parseInt(recipeServings),
      prepTime: recipePrepTime ? parseInt(recipePrepTime) : undefined,
      cookTime: recipeCookTime ? parseInt(recipeCookTime) : undefined,
      ingredients: ingredients.map((ing) => ({
        productId: ing.productId,
        quantity: parseFloat(ing.quantity),
        unit: ing.unit,
        notes: ing.notes || undefined,
      })),
    });
  }

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
              <div className="font-medium">{value ?? '-'}{value !== undefined ? unit : ''}</div>
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
        <h1 className="text-3xl font-bold">Recipes</h1>
        <Button onClick={() => setShowCreate(true)}>New Recipe</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')}>
          All Recipes
        </Button>
        <Button size="sm" variant={tab === 'suggestions' ? 'default' : 'outline'} onClick={() => setTab('suggestions')}>
          Suggestions
        </Button>
      </div>

      {/* Recipes List */}
      {tab === 'all' && (
        <div className="grid gap-4 md:grid-cols-2">
          {recipes?.map((recipe) => (
            <Card key={recipe.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedRecipeId(recipe.id)}>
              <CardContent className="p-4">
                <h3 className="font-medium">{recipe.name}</h3>
                {recipe.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{recipe.description}</p>}
                <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                  <span>{recipe.servings} servings</span>
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
            <Card key={recipe.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedRecipeId(recipe.id)}>
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
      <Dialog open={!!selectedRecipeId && !!recipeDetail} onClose={() => setSelectedRecipeId(null)} className="max-w-2xl">
        {recipeDetail && (
          <>
            <DialogHeader>
              <DialogTitle>{recipeDetail.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {recipeDetail.description && <p className="text-sm text-muted-foreground">{recipeDetail.description}</p>}

              <div className="flex gap-4 text-sm">
                <span>{recipeDetail.servings} servings</span>
                {recipeDetail.prepTime && <span>Prep: {recipeDetail.prepTime} min</span>}
                {recipeDetail.cookTime && <span>Cook: {recipeDetail.cookTime} min</span>}
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Ingredients</h4>
                <div className="space-y-1">
                  {recipeDetail.ingredients.map((ing) => (
                    <div key={ing.id} className="text-sm flex justify-between">
                      <span>{ing.productName}</span>
                      <span className="text-muted-foreground">{ing.quantity} {ing.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {renderNutrition(recipeDetail.totalNutrition, 'Total Nutrition')}
              {renderNutrition(recipeDetail.perServingNutrition, 'Per Serving')}
            </div>
            <DialogFooter>
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(recipeDetail.id)}>Delete</Button>
              <Button variant="outline" onClick={() => setSelectedRecipeId(null)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {/* Create Recipe Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} className="max-w-2xl">
        <DialogHeader><DialogTitle>New Recipe</DialogTitle></DialogHeader>
        <form onSubmit={handleCreate}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input value={recipeDesc} onChange={(e) => setRecipeDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Servings</label>
                <Input type="number" value={recipeServings} onChange={(e) => setRecipeServings(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Prep (min)</label>
                <Input type="number" value={recipePrepTime} onChange={(e) => setRecipePrepTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cook (min)</label>
                <Input type="number" value={recipeCookTime} onChange={(e) => setRecipeCookTime(e.target.value)} />
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
                    <span className="text-sm flex-1">{ing.productName}</span>
                    <Input
                      className="w-20"
                      type="number"
                      value={ing.quantity}
                      onChange={(e) => {
                        const updated = [...ingredients];
                        updated[i].quantity = e.target.value;
                        setIngredients(updated);
                      }}
                    />
                    <Select
                      className="w-24"
                      value={ing.unit}
                      onChange={(e) => {
                        const updated = [...ingredients];
                        updated[i].unit = e.target.value;
                        setIngredients(updated);
                      }}
                    >
                      {ALL_UNITS.map((u) => (
                        <option key={u.code} value={u.code}>{u.code}</option>
                      ))}
                    </Select>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeIngredient(i)}>X</Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || ingredients.length === 0}>Create</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
