import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { BarcodeScanner } from './barcode-scanner';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  ChainResponse,
  ProductResponse,
  StoreResponse,
  PriceRecordResponse,
} from '@personal-budget/shared';

export function GroceryPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [scannedProduct, setScannedProduct] = useState<ProductResponse | null>(null);
  const [showPriceDialog, setShowPriceDialog] = useState(false);
  const [showStoreDialog, setShowStoreDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductResponse | null>(null);
  const [showProductDetail, setShowProductDetail] = useState(false);

  // Price form
  const [priceStoreId, setPriceStoreId] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState('USD');

  // Store form
  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [storeChainId, setStoreChainId] = useState<string>('');

  const { data: products } = useQuery({
    queryKey: ['products', searchQuery],
    queryFn: () =>
      api
        .get<{ items: ProductResponse[] }>('/products', { params: { query: searchQuery || undefined } })
        .then((r) => r.data.items),
  });

  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.get<StoreResponse[]>('/stores').then((r) => r.data),
  });

  const { data: chains } = useQuery({
    queryKey: ['chains'],
    queryFn: () => api.get<ChainResponse[]>('/chains').then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: priceHistory } = useQuery({
    queryKey: ['prices', selectedProduct?.id],
    queryFn: () =>
      api.get<PriceRecordResponse[]>(`/prices/product/${selectedProduct!.id}`).then((r) => r.data),
    enabled: !!selectedProduct,
  });

  const scanMutation = useMutation({
    mutationFn: (barcode: string) =>
      api.get<ProductResponse>(`/products/barcode/${barcode}`).then((r) => r.data),
    onSuccess: (product) => {
      setScannedProduct(product);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const priceMutation = useMutation({
    mutationFn: (data: { productId: string; storeId: string; price: number; currencyCode: string }) =>
      api.post('/prices', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prices'] });
      setShowPriceDialog(false);
      setPriceAmount('');
    },
  });

  const storeMutation = useMutation({
    mutationFn: (data: { name: string; location?: string; chainId?: string | null }) =>
      api.post('/stores', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      setShowStoreDialog(false);
      setStoreName('');
      setStoreLocation('');
      setStoreChainId('');
    },
  });

  function handleScan(barcode: string) {
    scanMutation.mutate(barcode);
  }

  function handleRecordPrice(e: FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    priceMutation.mutate({
      productId: selectedProduct.id,
      storeId: priceStoreId,
      price: parseFloat(priceAmount),
      currencyCode: priceCurrency,
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Grocery</h1>

      {/* Barcode Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan Product</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <BarcodeScanner onScan={handleScan} />
          {scanMutation.isPending && <p className="text-sm text-muted-foreground">Looking up product...</p>}
          {scanMutation.error && (
            <p className="text-sm text-destructive">
              {(scanMutation.error as any).response?.data?.error || 'Product not found'}
            </p>
          )}
          {scannedProduct && (
            <div className="p-4 border border-border rounded-lg space-y-2">
              <div className="flex items-start gap-4">
                {scannedProduct.imageUrl && (
                  <img src={scannedProduct.imageUrl} alt={scannedProduct.name} className="w-16 h-16 object-cover rounded" />
                )}
                <div>
                  <h3 className="font-medium">{scannedProduct.name}</h3>
                  {scannedProduct.brand && <p className="text-sm text-muted-foreground">{scannedProduct.brand}</p>}
                  {scannedProduct.barcode && <p className="text-xs text-muted-foreground font-mono">{scannedProduct.barcode}</p>}
                </div>
              </div>
              {scannedProduct.nutritionalFacts && (
                <div className="grid grid-cols-4 gap-2 text-xs mt-2">
                  <div className="text-center p-1 bg-muted rounded">
                    <div className="font-medium">{scannedProduct.nutritionalFacts.calories}</div>
                    <div className="text-muted-foreground">kcal</div>
                  </div>
                  <div className="text-center p-1 bg-muted rounded">
                    <div className="font-medium">{scannedProduct.nutritionalFacts.protein}g</div>
                    <div className="text-muted-foreground">Protein</div>
                  </div>
                  <div className="text-center p-1 bg-muted rounded">
                    <div className="font-medium">{scannedProduct.nutritionalFacts.carbs}g</div>
                    <div className="text-muted-foreground">Carbs</div>
                  </div>
                  <div className="text-center p-1 bg-muted rounded">
                    <div className="font-medium">{scannedProduct.nutritionalFacts.fat}g</div>
                    <div className="text-muted-foreground">Fat</div>
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedProduct(scannedProduct);
                    setShowPriceDialog(true);
                  }}
                >
                  Record Price
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedProduct(scannedProduct);
                    setShowProductDetail(true);
                  }}
                >
                  Price History
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stores */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Stores</CardTitle>
          <Button size="sm" onClick={() => setShowStoreDialog(true)}>Add Store</Button>
        </CardHeader>
        <CardContent>
          {stores && stores.length > 0 ? (
            <div className="space-y-2">
              {stores.map((store) => (
                <div key={store.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="font-medium">
                      {store.name}
                      {store.chainName && (
                        <Badge variant="secondary" className="ml-2">{store.chainName}</Badge>
                      )}
                    </div>
                    {store.location && <div className="text-sm text-muted-foreground">{store.location}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No stores added yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Product Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
          />
          {products && products.length > 0 ? (
            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded"
                  onClick={() => {
                    setSelectedProduct(product);
                    setShowProductDetail(true);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {product.imageUrl && (
                      <img src={product.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                    )}
                    <div>
                      <div className="font-medium text-sm">{product.name}</div>
                      {product.brand && <div className="text-xs text-muted-foreground">{product.brand}</div>}
                    </div>
                  </div>
                  {product.barcode && <Badge variant="outline" className="font-mono text-xs">{product.barcode}</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No products found.' : 'Scan a barcode or search to find products.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Record Price Dialog */}
      <Dialog open={showPriceDialog} onClose={() => setShowPriceDialog(false)}>
        <DialogHeader>
          <DialogTitle>Record Price for {selectedProduct?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleRecordPrice}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Store</label>
              <Select value={priceStoreId} onChange={(e) => setPriceStoreId(e.target.value)} required>
                <option value="">Select store</option>
                {stores?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Price</label>
                <Input
                  type="number"
                  step="0.01"
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Input value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)} maxLength={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowPriceDialog(false)}>Cancel</Button>
            <Button type="submit" disabled={priceMutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Add Store Dialog */}
      <Dialog open={showStoreDialog} onClose={() => setShowStoreDialog(false)}>
        <DialogHeader>
          <DialogTitle>Add Store</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          storeMutation.mutate({
            name: storeName,
            location: storeLocation || undefined,
            chainId: storeChainId || null,
          });
        }}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g., Walmart Riverside" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Chain (optional)</label>
              <Select value={storeChainId} onChange={(e) => setStoreChainId(e.target.value)}>
                <option value="">— None —</option>
                {chains?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Location (optional)</label>
              <Input value={storeLocation} onChange={(e) => setStoreLocation(e.target.value)} placeholder="e.g., 123 Main St" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowStoreDialog(false)}>Cancel</Button>
            <Button type="submit" disabled={storeMutation.isPending}>Add</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Product Detail / Price History Dialog */}
      <Dialog open={showProductDetail} onClose={() => setShowProductDetail(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selectedProduct?.name} - Price History</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {priceHistory && priceHistory.length > 0 ? (
            <div className="space-y-2">
              {priceHistory.map((record) => (
                <div key={record.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="text-sm font-medium">{record.storeName}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(record.recordedAt)}</div>
                  </div>
                  <span className="font-medium">{formatCurrency(record.price, record.currencyCode)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No price records yet.</p>
          )}
          <Button
            size="sm"
            onClick={() => {
              setShowProductDetail(false);
              setShowPriceDialog(true);
            }}
          >
            Record New Price
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
