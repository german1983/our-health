import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import type { ProductResponse } from '@personal-budget/shared';

interface Props {
  open: boolean;
  initialQuery: string;
  /** Best-guess code from the receipt (used to prefill the barcode field). */
  initialBarcode?: string | null;
  onSelect: (productId: string) => void;
  onClose: () => void;
}

export function ProductPickerDialog({ open, initialQuery, initialBarcode, onSelect, onClose }: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'search' | 'create'>('search');
  // Once the user explicitly picks a tab, stop auto-switching.
  const [modePinned, setModePinned] = useState(false);
  const [newName, setNewName] = useState(initialQuery);
  const [newBarcode, setNewBarcode] = useState(initialBarcode ?? '');
  const [newBrand, setNewBrand] = useState('');

  // Reset state when dialog opens with a new initial query.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setNewName(initialQuery);
      setNewBarcode(initialBarcode ?? '');
      setNewBrand('');
      setMode('search');
      setModePinned(false);
    }
  }, [open, initialQuery, initialBarcode]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['products', query],
    queryFn: () =>
      api
        .get<{ items: ProductResponse[] }>('/products', {
          params: { query: query || undefined, limit: 10 },
        })
        .then((r) => r.data.items),
    enabled: open,
  });

  // When the search returns zero hits and the user hasn't manually picked
  // a tab, flip to Create so they don't have to hunt for the toggle.
  useEffect(() => {
    if (!open || modePinned) return;
    if (!isFetching && results && results.length === 0 && query.trim().length > 0) {
      setMode('create');
    }
  }, [open, modePinned, isFetching, results, query]);

  const createMutation = useMutation({
    mutationFn: (input: { name: string; barcode?: string; brand?: string }) =>
      api.post<ProductResponse>('/products', input).then((r) => r.data),
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSelect(product.id);
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate({
      name,
      barcode: newBarcode.trim() || undefined,
      brand: newBrand.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Match to product</DialogTitle>
      </DialogHeader>

      <div className="flex gap-2 mb-4 text-sm">
        <button
          type="button"
          className={mode === 'search' ? 'font-medium' : 'text-muted-foreground'}
          onClick={() => {
            setMode('search');
            setModePinned(true);
          }}
        >
          Find existing
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          className={mode === 'create' ? 'font-medium' : 'text-muted-foreground'}
          onClick={() => {
            setMode('create');
            setModePinned(true);
          }}
        >
          Create new
        </button>
      </div>

      {mode === 'search' ? (
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Search by name, brand, or barcode"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto rounded border border-border">
            {isFetching ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
            ) : !results || results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No products match. Switch to “Create new” to add one.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      <div>
                        <div className="font-medium">{p.name}</div>
                        {p.brand && <div className="text-xs text-muted-foreground">{p.brand}</div>}
                      </div>
                      {p.barcode && (
                        <span className="font-mono text-xs text-muted-foreground">{p.barcode}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Name *</span>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={200} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Barcode / UPC (optional)</span>
            <Input value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} className="font-mono" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Brand (optional)</span>
            <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} maxLength={200} />
          </label>
          {createMutation.error && (
            <p className="text-sm text-destructive">
              {(createMutation.error as { response?: { data?: { error?: string } } })
                .response?.data?.error || 'Could not create product'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || !newName.trim()}>
              {createMutation.isPending ? 'Creating…' : 'Create & link'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
