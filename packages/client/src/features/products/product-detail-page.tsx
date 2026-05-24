import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { UNITS } from '@personal-budget/shared';
import type {
  CategoryResponse,
  CreateProductPresentationInput,
  CreateServingUnitInput,
  ProductDetailResponse,
  ProductPresentationResponse,
  ProductStorageEntry,
  ServingUnitResponse,
  StorageSpaceResponse,
  UpdateProductInput,
  UpdateProductPresentationInput,
  UpdateServingUnitInput,
  UpdateStorageItemInput,
} from '@personal-budget/shared';
import {
  NUTRITION_FIELDS,
  emptyNutritionForm,
  formToNutrition,
  nutritionToForm,
  type NutritionFormState,
} from './nutrition-fields';

const ALL_UNITS = Object.values(UNITS);

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => api.get<ProductDetailResponse>(`/products/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: spaces } = useQuery({
    queryKey: ['storage', 'spaces'],
    queryFn: () => api.get<StorageSpaceResponse[]>('/storage/spaces').then((r) => r.data),
  });

  // Basic fields form
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const { data: categoryTree } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<CategoryResponse[]>('/finance/categories').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const flatExpenseCategories = (() => {
    if (!categoryTree) return [] as { id: string; name: string }[];
    const out: { id: string; name: string }[] = [];
    function walk(nodes: CategoryResponse[], depth: number) {
      for (const n of nodes) {
        if (n.type === 'EXPENSE') out.push({ id: n.id, name: `${'— '.repeat(depth)}${n.name}` });
        if (n.children) walk(n.children, depth + 1);
      }
    }
    walk(categoryTree, 0);
    return out;
  })();

  // Nutrition form
  const [nutritionForm, setNutritionForm] = useState<NutritionFormState>(emptyNutritionForm);
  const [baseAmount, setBaseAmount] = useState('100');
  const [baseUnit, setBaseUnit] = useState('g');

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setBrand(product.brand ?? '');
    setImageUrl(product.imageUrl ?? '');
    setCategoryId(product.categoryId ?? '');
    setNutritionForm(nutritionToForm(product.nutritionalFacts));
    setBaseAmount(String(product.nutritionBaseAmount));
    setBaseUnit(product.nutritionBaseUnit);
  }, [product]);

  const updateProductMutation = useMutation({
    mutationFn: (data: UpdateProductInput) =>
      api.patch<ProductDetailResponse>(`/products/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const updateStorageItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: UpdateStorageItemInput }) =>
      api.patch(`/storage/items/${itemId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });

  const deleteStorageItemMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/storage/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });

  const addPresentationMutation = useMutation({
    mutationFn: (data: CreateProductPresentationInput) =>
      api.post(`/products/${id}/presentations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', 'detail', id] });
    },
  });

  const updatePresentationMutation = useMutation({
    mutationFn: ({ pid, data }: { pid: string; data: UpdateProductPresentationInput }) =>
      api.patch(`/products/presentations/${pid}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', 'detail', id] });
    },
  });

  const deletePresentationMutation = useMutation({
    mutationFn: (pid: string) => api.delete(`/products/presentations/${pid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', 'detail', id] });
    },
  });

  // Custom-unit conversions live on a separate endpoint (the intake module
  // owns them today). They're household-shared per product.
  const { data: servingUnits } = useQuery({
    queryKey: ['intake', 'serving-units', id],
    queryFn: () =>
      api
        .get<ServingUnitResponse[]>('/intake/serving-units', { params: { productId: id } })
        .then((r) => r.data),
    enabled: !!id,
  });

  const addServingUnitMutation = useMutation({
    mutationFn: (data: CreateServingUnitInput) => api.post('/intake/serving-units', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake', 'serving-units', id] });
    },
  });

  const updateServingUnitMutation = useMutation({
    mutationFn: ({ unitId, data }: { unitId: string; data: UpdateServingUnitInput }) =>
      api.patch(`/intake/serving-units/${unitId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake', 'serving-units', id] });
    },
  });

  const deleteServingUnitMutation = useMutation({
    mutationFn: (unitId: string) => api.delete(`/intake/serving-units/${unitId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake', 'serving-units', id] });
    },
  });

  function handleSaveBasic(e: FormEvent) {
    e.preventDefault();
    updateProductMutation.mutate({
      name,
      brand: brand || null,
      imageUrl: imageUrl || null,
      categoryId: categoryId || null,
    });
  }

  function handleSaveNutrition(e: FormEvent) {
    e.preventDefault();
    updateProductMutation.mutate({
      nutritionalFacts: formToNutrition(nutritionForm),
      nutritionBaseAmount: parseFloat(baseAmount) || 100,
      nutritionBaseUnit: baseUnit,
    });
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (!product) {
    return <p className="text-sm text-muted-foreground">Product not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => navigate('/products')}>
          ← Back
        </Button>
        <h1 className="text-3xl font-bold flex-1 truncate">{product.name}</h1>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Info</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveBasic} className="space-y-4">
            <div className="flex items-start gap-4">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={name}
                  className="w-24 h-24 object-cover rounded border border-border flex-shrink-0"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                />
              )}
              <div className="flex-1 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Brand</label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Image URL</label>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">— Uncategorized —</option>
                    {flatExpenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={updateProductMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Nutritional Facts — only rendered for products in categories that
          track nutrition (e.g. Groceries). Cleaning supplies skip this. */}
      {product.categoryHasNutritionalFacts && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nutritional Facts</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveNutrition} className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Values per</span>
              <Input
                type="number"
                step="0.1"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                className="w-20"
              />
              <Select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className="w-28"
              >
                {ALL_UNITS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </Select>
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
                    value={nutritionForm[key]}
                    onChange={(e) =>
                      setNutritionForm({ ...nutritionForm, [key]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={updateProductMutation.isPending}>
                Save Nutrition
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}

      {/* Presentations / packaging */}
      <PresentationsCard
        presentations={product.presentations}
        onAdd={(data) => addPresentationMutation.mutate(data)}
        onUpdate={(pid, data) => updatePresentationMutation.mutate({ pid, data })}
        onDelete={(pid) => deletePresentationMutation.mutate(pid)}
        adding={addPresentationMutation.isPending}
      />

      {/* Custom unit conversions */}
      <CustomUnitsCard
        productId={product.id}
        baseUnit={product.nutritionBaseUnit}
        units={servingUnits ?? []}
        onAdd={(data) => addServingUnitMutation.mutate(data)}
        onUpdate={(unitId, data) => updateServingUnitMutation.mutate({ unitId, data })}
        onDelete={(unitId) => deleteServingUnitMutation.mutate(unitId)}
        adding={addServingUnitMutation.isPending}
      />

      {/* Stock / Storage entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">In Storage</CardTitle>
          <Badge variant="secondary">{product.storageEntries.length}</Badge>
        </CardHeader>
        <CardContent>
          {product.storageEntries.length > 0 ? (
            <div className="space-y-2">
              {product.storageEntries.map((entry) => (
                <StorageEntryRow
                  key={entry.id}
                  entry={entry}
                  spaces={spaces ?? []}
                  onSave={(data) =>
                    updateStorageItemMutation.mutate({ itemId: entry.id, data })
                  }
                  onDelete={() => deleteStorageItemMutation.mutate(entry.id)}
                  saving={updateStorageItemMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not in any storage space. Add it from the{' '}
              <Link to="/storage" className="underline">
                Storage
              </Link>{' '}
              page.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Purchase History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Purchase History</CardTitle>
          <Badge variant="secondary">{product.purchaseHistory.length}</Badge>
        </CardHeader>
        <CardContent>
          {product.purchaseHistory.length > 0 ? (
            <div className="space-y-1">
              {product.purchaseHistory.map((p) => (
                <Link
                  key={p.receiptItemId}
                  to={`/receipts/${p.receiptId}`}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.storeName ?? 'Unknown store'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.purchasedAt ? formatDate(p.purchasedAt) : '—'} · qty {p.quantity}
                      {p.unitPrice !== null && (
                        <> · {formatCurrency(p.unitPrice, p.currencyCode)} each</>
                      )}
                    </div>
                  </div>
                  <span className="font-medium text-sm">
                    {formatCurrency(p.lineTotal, p.currencyCode)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No purchase records yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StorageEntryRowProps {
  entry: ProductStorageEntry;
  spaces: StorageSpaceResponse[];
  onSave: (data: UpdateStorageItemInput) => void;
  onDelete: () => void;
  saving: boolean;
}

function StorageEntryRow({ entry, spaces, onSave, onDelete, saving }: StorageEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(entry.quantity));
  const [unit, setUnit] = useState(entry.unit);
  const [spaceId, setSpaceId] = useState(entry.storageSpaceId);
  const [expiry, setExpiry] = useState(entry.expiryDate ? entry.expiryDate.slice(0, 10) : '');

  function startEdit() {
    setQty(String(entry.quantity));
    setUnit(entry.unit);
    setSpaceId(entry.storageSpaceId);
    setExpiry(entry.expiryDate ? entry.expiryDate.slice(0, 10) : '');
    setEditing(true);
  }

  function handleSave() {
    onSave({
      quantity: parseFloat(qty),
      unit,
      storageSpaceId: spaceId,
      expiryDate: expiry ? new Date(expiry).toISOString() : null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 p-3 rounded border border-border bg-muted/30">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Space</label>
            <Select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quantity</label>
            <Input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unit</label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {ALL_UNITS.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Expiry</label>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {entry.quantity} {entry.unit}
          <span className="text-muted-foreground"> · {entry.spaceName}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Added {formatDate(entry.addedAt)}
          {entry.expiryDate && <> · expires {formatDate(entry.expiryDate)}</>}
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={startEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

interface PresentationsCardProps {
  presentations: ProductPresentationResponse[];
  onAdd: (data: CreateProductPresentationInput) => void;
  onUpdate: (id: string, data: UpdateProductPresentationInput) => void;
  onDelete: (id: string) => void;
  adding: boolean;
}

function PresentationsCard({
  presentations,
  onAdd,
  onUpdate,
  onDelete,
  adding,
}: PresentationsCardProps) {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [newBarcode, setNewBarcode] = useState('');
  const [newDefault, setNewDefault] = useState(false);

  function reset() {
    setNewName('');
    setNewAmount('');
    setNewUnit('g');
    setNewBarcode('');
    setNewDefault(false);
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const amt = parseFloat(newAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    onAdd({
      name: newName.trim(),
      amount: amt,
      unit: newUnit,
      barcode: newBarcode.trim() || undefined,
      isDefault: newDefault,
    });
    reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Presentations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          How this product is sold. Receipts use the default to convert "1 unit" into a real
          stock quantity (e.g., a 800 g jar adds 800 g, not 1 g).
        </p>

        {presentations.length > 0 && (
          <div className="space-y-2">
            {presentations.map((p) => (
              <PresentationRow
                key={p.id}
                presentation={p}
                onUpdate={(data) => onUpdate(p.id, data)}
                onDelete={() => onDelete(p.id)}
              />
            ))}
          </div>
        )}

        <form
          onSubmit={handleAdd}
          className="space-y-2 pt-2 border-t border-border"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_auto_auto] gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., 800 g jar"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Amount</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="800"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Unit</label>
              <Select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                {ALL_UNITS.map((u) => (
                  <option key={u.code} value={u.code}>{u.code}</option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
              <input
                type="checkbox"
                checked={newDefault}
                onChange={(e) => setNewDefault(e.target.checked)}
              />
              Default
            </label>
            <Button type="submit" size="sm" disabled={adding || !newName.trim() || !newAmount}>
              Add
            </Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Barcode / GTIN (optional)</label>
            <Input
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              placeholder="e.g., 8001505005707"
              className="font-mono text-xs"
            />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface CustomUnitsCardProps {
  productId: string;
  baseUnit: string;
  units: ServingUnitResponse[];
  onAdd: (data: CreateServingUnitInput) => void;
  onUpdate: (unitId: string, data: UpdateServingUnitInput) => void;
  onDelete: (unitId: string) => void;
  adding: boolean;
}

/**
 * Defines product-specific unit conversions (e.g., "1 slice = 21 g"). The
 * left side is the named unit, the right side is always expressed in the
 * product's nutrition base unit. Recipes and intake use these to translate
 * between mass and count without the user doing the math.
 */
function CustomUnitsCard({
  productId,
  baseUnit,
  units,
  onAdd,
  onUpdate,
  onDelete,
  adding,
}: CustomUnitsCardProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const v = parseFloat(amount);
    if (!name.trim() || !Number.isFinite(v) || v <= 0) return;
    onAdd({ productId, name: name.trim(), baseUnitEquivalent: v });
    setName('');
    setAmount('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom units</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Product-specific conversions between named units and mass/volume. Example: define{' '}
          <span className="font-mono">1 slice = 21 g</span> so recipes and intake can ask
          for "2 slices of roast beef" and get 42 g.
        </p>

        {units.length > 0 && (
          <div className="space-y-2">
            {units.map((u) => (
              <CustomUnitRow
                key={u.id}
                unit={u}
                baseUnit={baseUnit}
                onUpdate={(data) => onUpdate(u.id, data)}
                onDelete={() => onDelete(u.id)}
              />
            ))}
          </div>
        )}

        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto_auto] gap-2 items-end pt-2 border-t border-border"
        >
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unit name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., slice, scoop, piece"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">= amount in {baseUnit}</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="21"
              required
            />
          </div>
          <span className="text-xs text-muted-foreground pb-2">{baseUnit}</span>
          <Button type="submit" size="sm" disabled={adding || !name.trim() || !amount}>
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface CustomUnitRowProps {
  unit: ServingUnitResponse;
  baseUnit: string;
  onUpdate: (data: UpdateServingUnitInput) => void;
  onDelete: () => void;
}

function CustomUnitRow({ unit, baseUnit, onUpdate, onDelete }: CustomUnitRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(unit.name);
  const [amount, setAmount] = useState(String(unit.baseUnitEquivalent));

  function startEdit() {
    setName(unit.name);
    setAmount(String(unit.baseUnitEquivalent));
    setEditing(true);
  }

  function save() {
    const v = parseFloat(amount);
    if (!name.trim() || !Number.isFinite(v) || v <= 0) return;
    onUpdate({ name: name.trim(), baseUnitEquivalent: v });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto_auto] gap-2 items-end p-3 rounded border border-border bg-muted/30">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Unit name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">= amount in {baseUnit}</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground pb-2">{baseUnit}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="text-sm">
        <span className="font-mono">1 {unit.name}</span>
        <span className="text-muted-foreground"> = </span>
        <span className="font-mono">{unit.baseUnitEquivalent} {baseUnit}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={startEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove unit "${unit.name}"?`)) onDelete();
          }}
          className="text-destructive hover:text-destructive"
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

interface PresentationRowProps {
  presentation: ProductPresentationResponse;
  onUpdate: (data: UpdateProductPresentationInput) => void;
  onDelete: () => void;
}

function PresentationRow({ presentation, onUpdate, onDelete }: PresentationRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(presentation.name);
  const [amount, setAmount] = useState(String(presentation.amount));
  const [unit, setUnit] = useState(presentation.unit);
  const [barcode, setBarcode] = useState(presentation.barcode ?? '');

  function startEdit() {
    setName(presentation.name);
    setAmount(String(presentation.amount));
    setUnit(presentation.unit);
    setBarcode(presentation.barcode ?? '');
    setEditing(true);
  }

  function save() {
    onUpdate({
      name: name.trim(),
      amount: parseFloat(amount),
      unit,
      barcode: barcode.trim() ? barcode.trim() : null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 p-3 rounded border border-border bg-muted/30">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_auto] gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Amount</label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unit</label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {ALL_UNITS.map((u) => (
                <option key={u.code} value={u.code}>{u.code}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Barcode / GTIN</label>
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="font-mono text-xs"
            placeholder="(optional)"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {presentation.name}
          {presentation.isDefault && (
            <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {presentation.amount} {presentation.unit}
          {presentation.barcode && (
            <span className="ml-2 font-mono">· {presentation.barcode}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!presentation.isDefault && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onUpdate({ isDefault: true })}
            title="Make default"
          >
            Set default
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={startEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove presentation "${presentation.name}"?`)) onDelete();
          }}
          className="text-destructive hover:text-destructive"
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

