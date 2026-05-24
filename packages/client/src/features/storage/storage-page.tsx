import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { UNITS } from '@personal-budget/shared';
import type {
  InventoryByProductEntry,
  ProductResponse,
  SpaceType,
  StorageItemResponse,
  StorageSpaceResponse,
} from '@personal-budget/shared';

const ALL_UNITS = Object.values(UNITS);

const spaceTypeLabels: Record<SpaceType, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
  PANTRY: 'Pantry',
  CABINET: 'Cabinet',
  OTHER: 'Other',
};

export function StoragePage() {
  const queryClient = useQueryClient();
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'by-lot' | 'by-product'>('by-lot');

  // Space form
  const [spaceName, setSpaceName] = useState('');
  const [spaceType, setSpaceType] = useState<SpaceType>('OTHER');

  // Item form
  const [itemSpaceId, setItemSpaceId] = useState('');
  const [itemProductSearch, setItemProductSearch] = useState('');
  const [itemProductId, setItemProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnit, setItemUnit] = useState('unit');
  const [itemExpiry, setItemExpiry] = useState('');

  const { data: spaces } = useQuery({
    queryKey: ['storage', 'spaces'],
    queryFn: () => api.get<StorageSpaceResponse[]>('/storage/spaces').then((r) => r.data),
  });

  const { data: items } = useQuery({
    queryKey: ['storage', 'items', selectedSpaceId],
    queryFn: () =>
      selectedSpaceId
        ? api.get<StorageItemResponse[]>(`/storage/spaces/${selectedSpaceId}/items`).then((r) => r.data)
        : api.get<StorageItemResponse[]>('/storage/inventory').then((r) => r.data),
  });

  // Per-product aggregate — only relevant when viewing across all spaces.
  const { data: inventoryByProduct } = useQuery({
    queryKey: ['storage', 'inventory-by-product'],
    queryFn: () =>
      api.get<InventoryByProductEntry[]>('/storage/inventory-by-product').then((r) => r.data),
    enabled: viewMode === 'by-product' && selectedSpaceId === null,
  });

  const { data: productResults } = useQuery({
    queryKey: ['products', 'search', itemProductSearch],
    queryFn: () =>
      api.get<{ items: ProductResponse[] }>('/products', { params: { query: itemProductSearch } }).then((r) => r.data.items),
    enabled: itemProductSearch.length > 1,
  });

  const createSpaceMutation = useMutation({
    mutationFn: (data: { name: string; spaceType: SpaceType }) => api.post('/storage/spaces', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage'] });
      setShowAddSpace(false);
      setSpaceName('');
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (data: { storageSpaceId: string; productId: string; quantity: number; unit: string; expiryDate?: string }) =>
      api.post('/storage/items', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage'] });
      setShowAddItem(false);
      resetItemForm();
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/storage/items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['storage'] }),
  });

  function resetItemForm() {
    setItemProductSearch('');
    setItemProductId('');
    setItemQuantity('1');
    setItemUnit('unit');
    setItemExpiry('');
  }

  function handleAddItem(e: FormEvent) {
    e.preventDefault();
    addItemMutation.mutate({
      storageSpaceId: itemSpaceId,
      productId: itemProductId,
      quantity: parseFloat(itemQuantity),
      unit: itemUnit,
      expiryDate: itemExpiry ? new Date(itemExpiry).toISOString() : undefined,
    });
  }

  function getDaysUntilExpiry(expiryDate: string): number {
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Storage</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAddSpace(true)}>Add Space</Button>
          <Button size="sm" onClick={() => { setShowAddItem(true); setItemSpaceId(spaces?.[0]?.id || ''); }}>Add Item</Button>
        </div>
      </div>

      {/* Space Tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          size="sm"
          variant={selectedSpaceId === null ? 'default' : 'outline'}
          onClick={() => setSelectedSpaceId(null)}
        >
          All Items
        </Button>
        {spaces?.map((space) => (
          <Button
            key={space.id}
            size="sm"
            variant={selectedSpaceId === space.id ? 'default' : 'outline'}
            onClick={() => setSelectedSpaceId(space.id)}
          >
            {space.name}
            <Badge variant="secondary" className="ml-2">{space.itemCount}</Badge>
          </Button>
        ))}
        {/* Aggregation toggle only makes sense across all spaces — per-space
            views always show lots so you can see what's actually in the fridge. */}
        {selectedSpaceId === null && (
          <div className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-muted-foreground mr-1">View:</span>
            <Button
              size="sm"
              variant={viewMode === 'by-lot' ? 'default' : 'outline'}
              onClick={() => setViewMode('by-lot')}
            >
              By lot
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'by-product' ? 'default' : 'outline'}
              onClick={() => setViewMode('by-product')}
            >
              By product
            </Button>
          </div>
        )}
      </div>

      {/* Items List */}
      <Card>
        <CardContent className="p-4">
          {viewMode === 'by-product' && selectedSpaceId === null ? (
            inventoryByProduct && inventoryByProduct.length > 0 ? (
              <div className="space-y-2">
                {inventoryByProduct.map((entry) => (
                  <div
                    key={entry.productId}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{entry.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.totals.map((t, i) => (
                          <span key={`${t.family}-${t.unit}`}>
                            {i > 0 && ' + '}
                            <span className="font-mono">
                              {Number(t.quantity.toFixed(2))} {t.unit}
                            </span>
                          </span>
                        ))}
                        {' · '}
                        <span>
                          {entry.lotCount} {entry.lotCount === 1 ? 'lot' : 'lots'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No items in storage.</p>
            )
          ) : items && items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item) => {
                const daysUntilExpiry = item.expiryDate ? getDaysUntilExpiry(item.expiryDate) : null;
                return (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.quantity} {item.unit}
                        {!selectedSpaceId && ` · ${item.spaceName}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {daysUntilExpiry !== null && (
                        <Badge variant={daysUntilExpiry <= 3 ? 'destructive' : daysUntilExpiry <= 7 ? 'warning' : 'outline'}>
                          {daysUntilExpiry <= 0 ? 'Expired' : `${daysUntilExpiry}d`}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItemMutation.mutate(item.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No items in storage.</p>
          )}
        </CardContent>
      </Card>

      {/* Add Space Dialog */}
      <Dialog open={showAddSpace} onClose={() => setShowAddSpace(false)}>
        <DialogHeader><DialogTitle>Add Storage Space</DialogTitle></DialogHeader>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createSpaceMutation.mutate({ name: spaceName, spaceType }); }}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder="e.g., Kitchen Fridge" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={spaceType} onChange={(e) => setSpaceType(e.target.value as SpaceType)}>
                {Object.entries(spaceTypeLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowAddSpace(false)}>Cancel</Button>
            <Button type="submit" disabled={createSpaceMutation.isPending}>Create</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItem} onClose={() => setShowAddItem(false)}>
        <DialogHeader><DialogTitle>Add Item to Storage</DialogTitle></DialogHeader>
        <form onSubmit={handleAddItem}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Storage Space</label>
              <Select value={itemSpaceId} onChange={(e) => setItemSpaceId(e.target.value)} required>
                {spaces?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Product</label>
              <Input
                value={itemProductSearch}
                onChange={(e) => setItemProductSearch(e.target.value)}
                placeholder="Search products..."
              />
              {productResults && productResults.length > 0 && (
                <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${itemProductId === p.id ? 'bg-muted' : ''}`}
                      onClick={() => { setItemProductId(p.id); setItemProductSearch(p.name); }}
                    >
                      {p.name} {p.brand && `(${p.brand})`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity</label>
                <Input type="number" step="0.1" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Unit</label>
                <Select value={itemUnit} onChange={(e) => setItemUnit(e.target.value)}>
                  {ALL_UNITS.map((u) => (
                    <option key={u.code} value={u.code}>{u.name} ({u.code})</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Expiry Date (optional)</label>
              <Input type="date" value={itemExpiry} onChange={(e) => setItemExpiry(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowAddItem(false)}>Cancel</Button>
            <Button type="submit" disabled={addItemMutation.isPending || !itemProductId}>Add</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
