import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { UNITS } from '@personal-budget/shared';
import type {
  CreateProductInput,
  ProductPresentationResponse,
  ProductResponse,
} from '@personal-budget/shared';
import {
  ProductForm,
  emptyProductForm,
  formToCreateInput,
  type ProductFormState,
} from '@/features/products/product-form';

const ALL_UNITS = Object.values(UNITS);

interface Props {
  open: boolean;
  initialQuery: string;
  /** Best-guess code from the receipt — usually a chain SKU, sometimes a GTIN. */
  initialBarcode?: string | null;
  /** Finance category of the receipt line being matched — prefills the new product. */
  initialCategoryId?: string | null;
  /** Called when a (product, optional presentation) is selected to link. */
  onSelect: (productId: string, presentationId?: string | null) => void;
  onClose: () => void;
}

type CreateMode = 'new-product' | 'new-presentation' | 'replace-barcode';

export function ProductPickerDialog({
  open,
  initialQuery,
  initialBarcode,
  initialCategoryId,
  onSelect,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'search' | 'create'>('search');
  // Once the user explicitly picks a tab, stop auto-switching.
  const [modePinned, setModePinned] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>('new-product');
  const [form, setForm] = useState<ProductFormState>(emptyProductForm);

  // For the "new size" + "replace barcode" modes:
  const [linkProductQuery, setLinkProductQuery] = useState('');
  const [linkProduct, setLinkProduct] = useState<ProductResponse | null>(null);
  const [linkPresName, setLinkPresName] = useState('');
  const [linkPresAmount, setLinkPresAmount] = useState('');
  const [linkPresUnit, setLinkPresUnit] = useState('g');
  const [linkPresBarcode, setLinkPresBarcode] = useState('');
  const [linkPresIsDefault, setLinkPresIsDefault] = useState(false);
  // For "replace barcode": which existing presentation to update.
  const [linkPresId, setLinkPresId] = useState('');

  // Reset state when dialog opens. Pre-fill name + barcode + category from
  // the receipt line being matched so the user doesn't have to retype.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setForm({
        ...emptyProductForm,
        name: initialQuery,
        presentationBarcode: initialBarcode ?? '',
        categoryId: initialCategoryId ?? '',
      });
      setLinkProductQuery('');
      setLinkProduct(null);
      setLinkPresName('');
      setLinkPresAmount('');
      setLinkPresUnit('g');
      setLinkPresBarcode(initialBarcode ?? '');
      setLinkPresIsDefault(false);
      setLinkPresId('');
      setMode('search');
      setModePinned(false);
      setCreateMode('new-product');
    }
  }, [open, initialQuery, initialBarcode, initialCategoryId]);

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

  // For the link-to-existing modes we need a small product search.
  const { data: linkResults } = useQuery({
    queryKey: ['products', 'link-search', linkProductQuery],
    queryFn: () =>
      api
        .get<{ items: ProductResponse[] }>('/products', {
          params: { query: linkProductQuery || undefined, limit: 10 },
        })
        .then((r) => r.data.items),
    enabled: open && mode === 'create' && createMode !== 'new-product' && !linkProduct,
  });

  // For "replace barcode" we need the chosen product's existing presentations.
  const { data: linkProductDetail } = useQuery({
    queryKey: ['products', 'detail', linkProduct?.id],
    queryFn: () =>
      api
        .get<{ presentations: ProductPresentationResponse[] }>(`/products/${linkProduct!.id}`)
        .then((r) => r.data),
    enabled: !!linkProduct,
  });

  const createProductMutation = useMutation({
    mutationFn: (input: CreateProductInput) =>
      api.post<ProductResponse>('/products', input).then((r) => r.data),
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Server seeds a default presentation; matchReceiptItem will pick it up.
      onSelect(product.id);
    },
  });

  const addPresentationMutation = useMutation({
    mutationFn: ({
      productId,
      data,
    }: {
      productId: string;
      data: { name: string; amount: number; unit: string; barcode?: string; isDefault?: boolean };
    }) =>
      api
        .post<ProductPresentationResponse>(`/products/${productId}/presentations`, data)
        .then((r) => r.data),
    onSuccess: (presentation) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSelect(presentation.productId, presentation.id);
    },
  });

  const updatePresentationMutation = useMutation({
    mutationFn: ({
      presentationId,
      barcode,
    }: {
      presentationId: string;
      barcode: string;
    }) =>
      api
        .patch<ProductPresentationResponse>(`/products/presentations/${presentationId}`, { barcode })
        .then((r) => r.data),
    onSuccess: (presentation) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSelect(presentation.productId, presentation.id);
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (createMode === 'new-product') {
      if (!form.name.trim()) return;
      createProductMutation.mutate(formToCreateInput(form));
      return;
    }
    if (createMode === 'new-presentation') {
      if (!linkProduct || !linkPresName.trim()) return;
      const amount = parseFloat(linkPresAmount);
      if (!Number.isFinite(amount) || amount <= 0) return;
      addPresentationMutation.mutate({
        productId: linkProduct.id,
        data: {
          name: linkPresName.trim(),
          amount,
          unit: linkPresUnit,
          barcode: linkPresBarcode.trim() || undefined,
          isDefault: linkPresIsDefault,
        },
      });
      return;
    }
    if (createMode === 'replace-barcode') {
      if (!linkPresId || !linkPresBarcode.trim()) return;
      updatePresentationMutation.mutate({
        presentationId: linkPresId,
        barcode: linkPresBarcode.trim(),
      });
      return;
    }
  }

  const submitting =
    createProductMutation.isPending ||
    addPresentationMutation.isPending ||
    updatePresentationMutation.isPending;

  const error =
    createProductMutation.error ??
    addPresentationMutation.error ??
    updatePresentationMutation.error;

  const submitDisabled = useMemo(() => {
    if (submitting) return true;
    if (createMode === 'new-product') return !form.name.trim();
    if (createMode === 'new-presentation') {
      return !linkProduct || !linkPresName.trim() || !linkPresAmount;
    }
    if (createMode === 'replace-barcode') {
      return !linkPresId || !linkPresBarcode.trim();
    }
    return true;
  }, [submitting, createMode, form.name, linkProduct, linkPresName, linkPresAmount, linkPresId, linkPresBarcode]);

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
          {/* Three-way switch. Default is "brand-new product"; others link to
              an existing product so we don't fragment the same item across
              multiple Product rows. */}
          <div className="space-y-1 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                checked={createMode === 'new-product'}
                onChange={() => setCreateMode('new-product')}
              />
              <span>
                <span className="font-medium">Brand-new product</span>
                <span className="block text-xs text-muted-foreground">
                  Use when this is something you've never bought before.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                checked={createMode === 'new-presentation'}
                onChange={() => setCreateMode('new-presentation')}
              />
              <span>
                <span className="font-medium">New size of an existing product</span>
                <span className="block text-xs text-muted-foreground">
                  Same product, different package (e.g., the 1 kg bag of Nutella you already
                  have, but in 400 g). Stacks with the existing one in stock & recipes.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                checked={createMode === 'replace-barcode'}
                onChange={() => setCreateMode('replace-barcode')}
              />
              <span>
                <span className="font-medium">Replace barcode on an existing presentation</span>
                <span className="block text-xs text-muted-foreground">
                  Rare — only when the manufacturer reissued the same size with a new GTIN.
                </span>
              </span>
            </label>
          </div>

          <div className="max-h-[55vh] overflow-y-auto pt-2 border-t border-border">
            {createMode === 'new-product' && (
              <ProductForm value={form} onChange={setForm} />
            )}

            {createMode !== 'new-product' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Existing product</label>
                  {linkProduct ? (
                    <div className="flex items-center justify-between rounded border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{linkProduct.name}</div>
                        {linkProduct.brand && (
                          <div className="text-xs text-muted-foreground truncate">
                            {linkProduct.brand}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setLinkProduct(null);
                          setLinkPresId('');
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        autoFocus
                        placeholder="Search by name or brand"
                        value={linkProductQuery}
                        onChange={(e) => setLinkProductQuery(e.target.value)}
                      />
                      <div className="max-h-40 overflow-y-auto rounded border border-border">
                        {!linkResults || linkResults.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            {linkProductQuery
                              ? 'No products match.'
                              : 'Start typing to find a product to attach to.'}
                          </p>
                        ) : (
                          <ul className="divide-y divide-border">
                            {linkResults.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => setLinkProduct(p)}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40"
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{p.name}</div>
                                    {p.brand && (
                                      <div className="text-xs text-muted-foreground truncate">
                                        {p.brand}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {createMode === 'new-presentation' && linkProduct && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">New presentation</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="space-y-1 col-span-2">
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          value={linkPresName}
                          onChange={(e) => setLinkPresName(e.target.value)}
                          placeholder="e.g. 400 g jar"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Amount</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={linkPresAmount}
                          onChange={(e) => setLinkPresAmount(e.target.value)}
                          placeholder="400"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Unit</label>
                        <Select
                          value={linkPresUnit}
                          onChange={(e) => setLinkPresUnit(e.target.value)}
                        >
                          {ALL_UNITS.map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.code}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Barcode / GTIN</label>
                      <Input
                        value={linkPresBarcode}
                        onChange={(e) => setLinkPresBarcode(e.target.value)}
                        className="font-mono text-xs"
                        placeholder="(optional)"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={linkPresIsDefault}
                        onChange={(e) => setLinkPresIsDefault(e.target.checked)}
                      />
                      Mark as default for this product
                    </label>
                  </div>
                )}

                {createMode === 'replace-barcode' && linkProduct && linkProductDetail && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Which presentation?</div>
                    <Select
                      value={linkPresId}
                      onChange={(e) => setLinkPresId(e.target.value)}
                    >
                      <option value="">— Pick one —</option>
                      {linkProductDetail.presentations.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.amount} {p.unit})
                          {p.barcode ? ` · ${p.barcode}` : ''}
                          {p.isDefault ? ' · default' : ''}
                        </option>
                      ))}
                    </Select>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">New barcode</label>
                      <Input
                        value={linkPresBarcode}
                        onChange={(e) => setLinkPresBarcode(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {(error as { response?: { data?: { error?: string } } })
                .response?.data?.error || 'Could not complete the action'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitDisabled}>
              {submitting
                ? 'Saving…'
                : createMode === 'new-product'
                  ? 'Create & link'
                  : createMode === 'new-presentation'
                    ? 'Add size & link'
                    : 'Update & link'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
