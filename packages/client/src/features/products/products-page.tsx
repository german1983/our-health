import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import type { ProductResponse } from '@personal-budget/shared';

interface ProductsResponse {
  items: ProductResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'list', searchQuery, page],
    queryFn: () =>
      api
        .get<ProductsResponse>('/products', {
          params: { query: searchQuery || undefined, page, limit },
        })
        .then((r) => r.data),
  });

  function hasNutrition(p: ProductResponse): boolean {
    const nf = p.nutritionalFacts;
    if (!nf) return false;
    return Object.values(nf).some((v) => v !== undefined && v !== null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Products</h1>
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
    </div>
  );
}
