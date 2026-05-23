import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import type {
  RecipeResponse,
  RecipeDetailResponse,
  RecipeSuggestionResponse,
  NutritionalFacts,
} from '@personal-budget/shared';
import {
  RecipeForm,
  recipeToFormValues,
  type RecipeFormSubmitPayload,
} from './recipe-form';

export function RecipesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'all' | 'suggestions'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);

  const { data: recipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get<RecipeResponse[]>('/recipes').then((r) => r.data),
  });

  const { data: suggestions } = useQuery({
    queryKey: ['recipes', 'suggestions'],
    queryFn: () => api.get<RecipeSuggestionResponse[]>('/recipes/suggestions').then((r) => r.data),
    enabled: tab === 'suggestions',
  });

  const detailId = editingRecipeId ?? selectedRecipeId;
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
            <Card
              key={recipe.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedRecipeId(recipe.id)}
            >
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
        open={!!selectedRecipeId && !editingRecipeId && !!recipeDetail}
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
                size="sm"
                onClick={() => {
                  setEditingRecipeId(recipeDetail.id);
                  setSelectedRecipeId(null);
                }}
              >
                Edit
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
    </div>
  );
}
