import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { UNITS } from '@personal-budget/shared';
import type { CreateProductInput, ProductResponse } from '@personal-budget/shared';
import {
  NUTRITION_FIELDS,
  emptyNutritionForm,
  formToNutrition,
  type NutritionFormState,
} from './nutrition-fields';

const ALL_UNITS = Object.values(UNITS);

interface ProductsResponse {
  items: ProductResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function ProductsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBrand, setCreateBrand] = useState('');
  const [createBarcode, setCreateBarcode] = useState('');
  const [createImageUrl, setCreateImageUrl] = useState('');
  const [createBaseAmount, setCreateBaseAmount] = useState('100');
  const [createBaseUnit, setCreateBaseUnit] = useState('g');
  const [createNutrition, setCreateNutrition] = useState<NutritionFormState>(emptyNutritionForm);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'list', searchQuery, page],
    queryFn: () =>
      api
        .get<ProductsResponse>('/products', {
          params: { query: searchQuery || undefined, page, limit },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateProductInput) =>
      api.post<ProductResponse>('/products', input).then((r) => r.data),
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreate(false);
      resetCreateForm();
      navigate(`/products/${product.id}`);
    },
  });

  function resetCreateForm() {
    setCreateName('');
    setCreateBrand('');
    setCreateBarcode('');
    setCreateImageUrl('');
    setCreateBaseAmount('100');
    setCreateBaseUnit('g');
    setCreateNutrition(emptyNutritionForm);
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const baseAmount = parseFloat(createBaseAmount);
    createMutation.mutate({
      name: createName.trim(),
      brand: createBrand.trim() || undefined,
      barcode: createBarcode.trim() || undefined,
      imageUrl: createImageUrl.trim() || undefined,
      nutritionBaseAmount: Number.isFinite(baseAmount) && baseAmount > 0 ? baseAmount : undefined,
      nutritionBaseUnit: createBaseUnit,
      nutritionalFacts: formToNutrition(createNutrition) ?? undefined,
    });
  }

  function hasNutrition(p: ProductResponse): boolean {
    const nf = p.nutritionalFacts;
    if (!nf) return false;
    return Object.values(nf).some((v) => v !== undefined && v !== null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Products</h1>
        <Button onClick={() => setShowCreate(true)}>New product</Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, brand, or barcode..."
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="space-y-1">
                {data.items.map((product) => (
                  <Link
                    key={product.id}
                    to={`/products/${product.id}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="w-10 h-10 object-cover rounded border border-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded border border-border bg-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{product.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {product.brand && <span>{product.brand}</span>}
                        {product.brand && product.barcode && <span> · </span>}
                        {product.barcode && <span className="font-mono">{product.barcode}</span>}
                      </div>
                    </div>
                    {!hasNutrition(product) && (
                      <Badge variant="warning" className="text-xs flex-shrink-0">
                        No nutrition
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Page {data.page} of {data.totalPages} ({data.total} products)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= data.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery ? 'No products match your search.' : 'No products yet.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* New Product Dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        className="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate}>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Brand</label>
                <Input
                  value={createBrand}
                  onChange={(e) => setCreateBrand(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Barcode</label>
                <Input
                  value={createBarcode}
                  onChange={(e) => setCreateBarcode(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Image URL</label>
                <Input
                  value={createImageUrl}
                  onChange={(e) => setCreateImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Nutritional facts per</span>
                <Input
                  type="number"
                  step="0.1"
                  value={createBaseAmount}
                  onChange={(e) => setCreateBaseAmount(e.target.value)}
                  className="w-20"
                />
                <Select
                  value={createBaseUnit}
                  onChange={(e) => setCreateBaseUnit(e.target.value)}
                  className="w-28"
                >
                  {ALL_UNITS.map((u) => (
                    <option key={u.code} value={u.code}>{u.code}</option>
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
                      value={createNutrition[key]}
                      onChange={(e) =>
                        setCreateNutrition({ ...createNutrition, [key]: e.target.value })
                      }
                      placeholder="-"
                    />
                  </div>
                ))}
              </div>
            </div>

            {createMutation.error && (
              <p className="text-sm text-destructive">
                {(createMutation.error as { response?: { data?: { error?: string } } }).response
                  ?.data?.error || 'Failed to create product'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                resetCreateForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !createName.trim()}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
