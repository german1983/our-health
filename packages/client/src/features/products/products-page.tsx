import { useState, type FormEvent } from 'react';
import { Tags } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import type { CreateProductInput, ProductResponse } from '@personal-budget/shared';
import {
  ProductForm,
  emptyProductForm,
  formToCreateInput,
  type ProductFormState,
} from './product-form';

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
  const [createForm, setCreateForm] = useState<ProductFormState>(emptyProductForm);

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
      setCreateForm(emptyProductForm);
      navigate(`/products/${product.id}`);
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(formToCreateInput(createForm));
  }

  // A product only earns the "No nutrition" warning if its category says
  // nutrition applies (e.g. food). Cleaning supplies legitimately have none.
  function showsNoNutritionWarning(p: ProductResponse): boolean {
    if (!p.categoryHasNutritionalFacts) return false;
    const nf = p.nutritionalFacts;
    if (!nf) return true;
    return !Object.values(nf).some((v) => v !== undefined && v !== null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Tags className="h-6 w-6 sm:h-7 sm:w-7 text-fitness" />
          Products
        </h1>
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
                    {showsNoNutritionWarning(product) && (
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
            <ProductForm value={createForm} onChange={setCreateForm} />
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
                setCreateForm(emptyProductForm);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !createForm.name.trim()}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
