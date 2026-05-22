import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Link2, Link2Off, Lock, Unlock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type {
  CategoryResponse,
  PaymentMethodResponse,
  ReceiptAdjustmentResponse,
  ReceiptItemResponse,
  ReceiptResponse,
  StorageSpaceResponse,
  StoreResponse,
  TaxCategoryResponse,
  UpdateReceiptInput,
  UpdateReceiptItemInput,
} from '@personal-budget/shared';
import { ProductPickerDialog } from './product-picker-dialog';

/** Flatten the household category tree to an ordered list with depth-aware names. */
function flattenCategories(tree: CategoryResponse[]): CategoryResponse[] {
  const out: CategoryResponse[] = [];
  function walk(nodes: CategoryResponse[], depth: number) {
    for (const n of nodes) {
      out.push({ ...n, name: `${'— '.repeat(depth)}${n.name}` });
      if (n.children) walk(n.children, depth + 1);
    }
  }
  walk(tree, 0);
  return out;
}

/** Group identifier for collapsing duplicate lines (same product within the receipt). */
function groupKeyOf(item: ReceiptItemResponse): string {
  return item.rawCode ? `code:${item.rawCode}` : `name:${item.rawName.trim().toLowerCase()}`;
}

interface ItemGroup {
  key: string;
  items: ReceiptItemResponse[];
}

function groupItems(items: ReceiptItemResponse[]): ItemGroup[] {
  const map = new Map<string, ReceiptItemResponse[]>();
  for (const item of items) {
    const k = groupKeyOf(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}

const TOLERANCE = 0.011;
const TAX_TOLERANCE = 0.05;

function near(a: number | null | undefined, b: number | null | undefined, tol = TOLERANCE): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

// Per-row tax share. Once confirmed, use the snapshot the server wrote;
// before that, distribute the printed tax across taxed items so the user
// gets a live preview as they tweak categories.
function distributeTax(receipt: ReceiptResponse): Map<string, number> {
  const shares = new Map<string, number>();
  if (receipt.status === 'REVIEWED') {
    for (const i of receipt.items) {
      if (i.taxAmount != null) shares.set(i.id, i.taxAmount);
    }
    return shares;
  }
  if (receipt.tax == null || receipt.tax === 0) return shares;
  const taxed = receipt.items.filter((i) => (i.taxCategoryRate ?? 0) > 0);
  const weighted = taxed.reduce((sum, i) => sum + i.lineTotal * (i.taxCategoryRate ?? 0), 0);
  if (weighted === 0) return shares;
  for (const item of taxed) {
    const weight = item.lineTotal * (item.taxCategoryRate ?? 0);
    shares.set(item.id, (receipt.tax * weight) / weighted);
  }
  return shares;
}

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [grouped, setGrouped] = useState(true);
  const [pickerItem, setPickerItem] = useState<ReceiptItemResponse | null>(null);

  const { data: receipt, isLoading, error } = useQuery({
    queryKey: ['receipt', id],
    queryFn: () => api.get<ReceiptResponse>(`/receipts/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: taxCategories } = useQuery({
    queryKey: ['tax-categories'],
    queryFn: () => api.get<TaxCategoryResponse[]>('/receipts/tax-categories').then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.get<StoreResponse[]>('/stores').then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.get<PaymentMethodResponse[]>('/payment-methods').then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: storageSpacesData } = useQuery({
    queryKey: ['storage-spaces'],
    queryFn: () => api.get<StorageSpaceResponse[]>('/storage/spaces').then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: categoryTree } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<CategoryResponse[]>('/finance/categories').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const flatCategories = useMemo(
    () => (categoryTree ? flattenCategories(categoryTree).filter((c) => c.type === 'EXPENSE') : []),
    [categoryTree],
  );
  const incomeCategories = useMemo(
    () => (categoryTree ? flattenCategories(categoryTree).filter((c) => c.type === 'INCOME') : []),
    [categoryTree],
  );

  const onReceiptUpdate = (updated: ReceiptResponse) => {
    queryClient.setQueryData(['receipt', id], updated);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  };

  const setCategory = useMutation({
    mutationFn: async (input: { itemId: string; taxCategoryId: string | null }) => {
      const { data } = await api.patch<ReceiptResponse>(
        `/receipts/items/${input.itemId}/tax-category`,
        { taxCategoryId: input.taxCategoryId, applyToChain: true, applyToReceipt: true },
      );
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const patchItem = useMutation({
    mutationFn: async (input: { itemId: string; data: UpdateReceiptItemInput }) => {
      const { data } = await api.patch<ReceiptResponse>(
        `/receipts/items/${input.itemId}`,
        input.data,
      );
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const patchReceipt = useMutation({
    mutationFn: async (data: UpdateReceiptInput) => {
      const { data: result } = await api.patch<ReceiptResponse>(`/receipts/${id}`, data);
      return result;
    },
    onSuccess: onReceiptUpdate,
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ReceiptResponse>(`/receipts/${id}/confirm`);
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const setFinanceCategory = useMutation({
    mutationFn: async (input: { itemId: string; financeCategoryId: string | null }) => {
      const { data } = await api.patch<ReceiptResponse>(
        `/receipts/items/${input.itemId}/finance-category`,
        { financeCategoryId: input.financeCategoryId, applyToReceipt: true },
      );
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const matchProduct = useMutation({
    mutationFn: async (input: { itemId: string; productId: string | null }) => {
      const { data } = await api.patch<ReceiptResponse>(
        `/receipts/items/${input.itemId}/product`,
        { productId: input.productId, saveChainCode: true, applyToReceipt: true },
      );
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const unlock = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ReceiptResponse>(`/receipts/${id}/unlock`);
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const addAdjustment = useMutation({
    mutationFn: async (input: {
      categoryId: string;
      amount: number;
      description?: string;
    }) => {
      const { data } = await api.post<ReceiptResponse>(
        `/receipts/${id}/adjustments`,
        input,
      );
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const patchAdjustment = useMutation({
    mutationFn: async (input: {
      adjId: string;
      data: { categoryId?: string; amount?: number; description?: string | null };
    }) => {
      const { data } = await api.patch<ReceiptResponse>(
        `/receipts/adjustments/${input.adjId}`,
        input.data,
      );
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const deleteAdjustment = useMutation({
    mutationFn: async (adjId: string) => {
      const { data } = await api.delete<ReceiptResponse>(`/receipts/adjustments/${adjId}`);
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const sumLineTotals = useMemo(
    () => receipt?.items.reduce((sum, i) => sum + i.lineTotal, 0) ?? 0,
    [receipt],
  );

  const totalAdjustments = useMemo(
    () => receipt?.adjustments.reduce((sum, a) => sum + a.amount, 0) ?? 0,
    [receipt],
  );

  const expectedTax = useMemo(() => {
    if (!receipt) return 0;
    return receipt.items.reduce(
      (sum, i) =>
        sum +
        i.lineTotal *
          (receipt.status === 'REVIEWED' ? i.taxRate ?? 0 : i.taxCategoryRate ?? 0),
      0,
    );
  }, [receipt]);

  const anyCategorized = useMemo(
    () => receipt?.items.some((i) => i.taxCategoryId != null || i.taxRate != null) ?? false,
    [receipt],
  );

  const taxShares = useMemo(() => (receipt ? distributeTax(receipt) : new Map()), [receipt]);

  const subtotalMatches = near(sumLineTotals, receipt?.subtotal);
  const totalMatches =
    receipt?.subtotal != null && receipt?.tax != null && receipt?.total != null
      ? near(receipt.subtotal + receipt.tax, receipt.total)
      : false;
  const taxMatches =
    !anyCategorized || receipt?.tax == null
      ? true
      : near(expectedTax, receipt.tax, TAX_TOLERANCE);
  const allGood = subtotalMatches && totalMatches && taxMatches;

  if (isLoading) {
    return <div className="text-muted-foreground">Loading…</div>;
  }
  if (error || !receipt) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-destructive">Receipt not found.</p>
      </div>
    );
  }

  const locked = receipt.status === 'REVIEWED';

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{receipt.chainName ?? receipt.chainKey ?? 'Unknown'}</h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant={receipt.status === 'PARSED' ? 'default' : locked ? 'secondary' : 'secondary'}>
              {receipt.status}
            </Badge>
            {receipt.parserVersion && (
              <span className="ml-2 font-mono text-xs">{receipt.parserVersion}</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono">
            {receipt.total != null ? formatCurrency(receipt.total, receipt.currencyCode) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">{receipt.currencyCode}</div>
        </div>
      </div>

      {/* Receipt header / metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Purchased on">
            <Input
              type="date"
              disabled={locked}
              defaultValue={receipt.purchasedAt ? receipt.purchasedAt.slice(0, 10) : ''}
              onBlur={(e) => {
                const v = e.target.value;
                const next = v ? new Date(v + 'T12:00:00Z').toISOString() : null;
                if (next !== receipt.purchasedAt) {
                  patchReceipt.mutate({ purchasedAt: next });
                }
              }}
            />
          </Field>
          <Field label="Linked store">
            <Select
              value={receipt.storeId ?? ''}
              disabled={locked}
              onChange={(e) => patchReceipt.mutate({ storeId: e.target.value || null })}
            >
              <option value="">— None —</option>
              {stores?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Currency">
            <Input
              disabled={locked}
              defaultValue={receipt.currencyCode}
              maxLength={3}
              onBlur={(e) => {
                const v = e.target.value.toUpperCase();
                if (v.length === 3 && v !== receipt.currencyCode) {
                  patchReceipt.mutate({ currencyCode: v });
                }
              }}
            />
          </Field>
          <Field label="Subtotal">
            <MoneyInput
              disabled={locked}
              value={receipt.subtotal}
              onSave={(v) => patchReceipt.mutate({ subtotal: v })}
            />
          </Field>
          <Field label="Tax">
            <MoneyInput
              disabled={locked}
              value={receipt.tax}
              onSave={(v) => patchReceipt.mutate({ tax: v })}
            />
          </Field>
          <Field label="Total">
            <MoneyInput
              disabled={locked}
              value={receipt.total}
              onSave={(v) => patchReceipt.mutate({ total: v })}
            />
          </Field>
          <Field label="Payment method">
            <Select
              value={receipt.paymentMethodId ?? ''}
              disabled={locked}
              onChange={(e) => patchReceipt.mutate({ paymentMethodId: e.target.value || null })}
            >
              <option value="">— None —</option>
              {paymentMethods?.filter((m) => !m.archived).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Default expense category">
            <Select
              value={receipt.defaultCategoryId ?? ''}
              disabled={locked}
              onChange={(e) => patchReceipt.mutate({ defaultCategoryId: e.target.value || null })}
            >
              <option value="">— None —</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Default storage space">
            <Select
              value={receipt.defaultStorageSpaceId ?? ''}
              disabled={locked}
              onChange={(e) =>
                patchReceipt.mutate({ defaultStorageSpaceId: e.target.value || null })
              }
            >
              <option value="">— Don't inventory —</option>
              {storageSpacesData?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* Reconciliation banner */}
      <div
        className={cn(
          'rounded-md border p-3 text-sm',
          allGood
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        {allGood ? (
          <div className="space-y-1">
            <span>Totals reconcile. {receipt.items.length} items, math checks out.</span>
            {totalAdjustments > 0 && receipt.total != null && (
              <div className="text-xs opacity-80">
                Adjustments: {formatCurrency(totalAdjustments, receipt.currencyCode)} → Net paid:{' '}
                <strong>{formatCurrency(receipt.total - totalAdjustments, receipt.currencyCode)}</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="font-medium">Numbers don't reconcile</div>
            {!subtotalMatches && (
              <div>
                · Items sum to <strong>{formatCurrency(sumLineTotals, receipt.currencyCode)}</strong>,
                printed subtotal is{' '}
                <strong>
                  {receipt.subtotal != null ? formatCurrency(receipt.subtotal, receipt.currencyCode) : '—'}
                </strong>
                {receipt.subtotal != null && (
                  <> (Δ {formatCurrency(sumLineTotals - receipt.subtotal, receipt.currencyCode)})</>
                )}
              </div>
            )}
            {!totalMatches && (
              <div>
                · Subtotal + tax ={' '}
                <strong>
                  {receipt.subtotal != null && receipt.tax != null
                    ? formatCurrency(receipt.subtotal + receipt.tax, receipt.currencyCode)
                    : '—'}
                </strong>{' '}
                but printed total is{' '}
                <strong>
                  {receipt.total != null ? formatCurrency(receipt.total, receipt.currencyCode) : '—'}
                </strong>
              </div>
            )}
            {!taxMatches && (
              <div>
                · Categories imply{' '}
                <strong>{formatCurrency(expectedTax, receipt.currencyCode)}</strong> of tax,
                receipt shows{' '}
                <strong>
                  {receipt.tax != null ? formatCurrency(receipt.tax, receipt.currencyCode) : '—'}
                </strong>
                {receipt.tax != null && (
                  <> (Δ {formatCurrency(expectedTax - receipt.tax, receipt.currencyCode)})</>
                )}
                . Check the Category column for items that should (or shouldn't) be taxed.
              </div>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => setGrouped(e.target.checked)}
            />
            Group duplicate lines
          </label>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2 text-center">Tax</th>
                <th className="px-4 py-2">Tax category</th>
                <th className="px-4 py-2">Expense category</th>
                <th className="px-4 py-2">Storage</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Pre-tax</th>
                <th className="px-4 py-2 text-right">All-in</th>
                <th className="px-4 py-2 text-center w-8" />
              </tr>
            </thead>
            <tbody>
              {grouped
                ? groupItems(receipt.items).map((group) =>
                    group.items.length === 1 ? (
                      <ItemRow
                        key={group.key}
                        item={group.items[0]}
                        currencyCode={receipt.currencyCode}
                        taxShare={taxShares.get(group.items[0].id) ?? 0}
                        categories={taxCategories ?? []}
                        financeCategories={flatCategories}
                        storageSpaces={storageSpacesData ?? []}
                        locked={locked}
                        catPending={setCategory.isPending && setCategory.variables?.itemId === group.items[0].id}
                        financeCatPending={setFinanceCategory.isPending && setFinanceCategory.variables?.itemId === group.items[0].id}
                        fieldPending={patchItem.isPending && patchItem.variables?.itemId === group.items[0].id}
                        matchPending={matchProduct.isPending && matchProduct.variables?.itemId === group.items[0].id}
                        onChangeCategory={(taxCategoryId) =>
                          setCategory.mutate({ itemId: group.items[0].id, taxCategoryId })
                        }
                        onChangeFinanceCategory={(financeCategoryId) =>
                          setFinanceCategory.mutate({ itemId: group.items[0].id, financeCategoryId })
                        }
                        onPatch={(data) => patchItem.mutate({ itemId: group.items[0].id, data })}
                        onMatch={() => setPickerItem(group.items[0])}
                        onUnmatch={() => matchProduct.mutate({ itemId: group.items[0].id, productId: null })}
                      />
                    ) : (
                      <GroupRow
                        key={group.key}
                        group={group}
                        currencyCode={receipt.currencyCode}
                        taxShares={taxShares}
                        categories={taxCategories ?? []}
                        financeCategories={flatCategories}
                        storageSpaces={storageSpacesData ?? []}
                        locked={locked}
                        catPending={setCategory.isPending && group.items.some((i) => setCategory.variables?.itemId === i.id)}
                        financeCatPending={setFinanceCategory.isPending && group.items.some((i) => setFinanceCategory.variables?.itemId === i.id)}
                        matchPending={matchProduct.isPending && group.items.some((i) => matchProduct.variables?.itemId === i.id)}
                        onChangeCategory={(taxCategoryId) =>
                          setCategory.mutate({ itemId: group.items[0].id, taxCategoryId })
                        }
                        onChangeFinanceCategory={(financeCategoryId) =>
                          setFinanceCategory.mutate({ itemId: group.items[0].id, financeCategoryId })
                        }
                        onPatchAll={(data) => {
                          // Cascade per-row mutation across every item in the group.
                          for (const i of group.items) {
                            patchItem.mutate({ itemId: i.id, data });
                          }
                        }}
                        onMatch={() => setPickerItem(group.items[0])}
                        onUnmatch={() => matchProduct.mutate({ itemId: group.items[0].id, productId: null })}
                      />
                    ),
                  )
                : receipt.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      currencyCode={receipt.currencyCode}
                      taxShare={taxShares.get(item.id) ?? 0}
                      categories={taxCategories ?? []}
                      financeCategories={flatCategories}
                      storageSpaces={storageSpacesData ?? []}
                      locked={locked}
                      catPending={setCategory.isPending && setCategory.variables?.itemId === item.id}
                      financeCatPending={setFinanceCategory.isPending && setFinanceCategory.variables?.itemId === item.id}
                      fieldPending={patchItem.isPending && patchItem.variables?.itemId === item.id}
                      matchPending={matchProduct.isPending && matchProduct.variables?.itemId === item.id}
                      onChangeCategory={(taxCategoryId) =>
                        setCategory.mutate({ itemId: item.id, taxCategoryId })
                      }
                      onChangeFinanceCategory={(financeCategoryId) =>
                        setFinanceCategory.mutate({ itemId: item.id, financeCategoryId })
                      }
                      onPatch={(data) => patchItem.mutate({ itemId: item.id, data })}
                      onMatch={() => setPickerItem(item)}
                      onUnmatch={() => matchProduct.mutate({ itemId: item.id, productId: null })}
                    />
                  ))}
            </tbody>
            <tfoot className="border-t border-border text-sm">
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={9}>Subtotal</td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.subtotal != null ? formatCurrency(receipt.subtotal, receipt.currencyCode) : '—'}
                </td>
                <td />
              </tr>
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={9}>Tax</td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.tax != null ? formatCurrency(receipt.tax, receipt.currencyCode) : '—'}
                </td>
                <td />
              </tr>
              <tr>
                <td className="px-4 py-2 text-right font-medium" colSpan={9}>Total</td>
                <td className="px-4 py-2 text-right font-mono font-medium">
                  {receipt.total != null ? formatCurrency(receipt.total, receipt.currencyCode) : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <AdjustmentsCard
        adjustments={receipt.adjustments}
        currencyCode={receipt.currencyCode}
        incomeCategories={incomeCategories}
        locked={locked}
        onAdd={(input) => addAdjustment.mutate(input)}
        onPatch={(adjId, data) => patchAdjustment.mutate({ adjId, data })}
        onDelete={(adjId) => deleteAdjustment.mutate(adjId)}
        pendingAdd={addAdjustment.isPending}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {locked
            ? 'This receipt is locked. Per-item tax amounts are snapshotted; future rate changes will not affect this entry.'
            : 'Edit anything that looks off, then confirm to lock the receipt as a ledger entry.'}
        </div>
        {locked ? (
          <Button
            variant="outline"
            onClick={() => unlock.mutate()}
            disabled={unlock.isPending}
          >
            <Unlock className="mr-1 h-4 w-4" />
            {unlock.isPending ? 'Unlocking…' : 'Unlock to edit'}
          </Button>
        ) : (
          <Button
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending || !subtotalMatches || !totalMatches}
            title={
              !subtotalMatches || !totalMatches
                ? 'Resolve reconciliation issues before confirming'
                : undefined
            }
          >
            <Lock className="mr-1 h-4 w-4" />
            {confirm.isPending ? 'Confirming…' : 'Confirm receipt'}
          </Button>
        )}
      </div>

      {(confirm.error || unlock.error || patchReceipt.error || patchItem.error || setCategory.error || setFinanceCategory.error || matchProduct.error) && (
        <p className="text-sm text-destructive">
          {(
            (confirm.error || unlock.error || patchReceipt.error || patchItem.error || setCategory.error || setFinanceCategory.error || matchProduct.error) as {
              response?: { data?: { error?: string } };
            }
          ).response?.data?.error || 'Update failed'}
        </p>
      )}

      <ProductPickerDialog
        open={pickerItem !== null}
        initialQuery={pickerItem?.rawName ?? ''}
        initialBarcode={pickerItem?.rawCode ?? null}
        onClose={() => setPickerItem(null)}
        onSelect={(productId) => {
          if (pickerItem) {
            matchProduct.mutate({ itemId: pickerItem.id, productId });
          }
          setPickerItem(null);
        }}
      />
    </div>
  );
}

interface ItemRowProps {
  item: ReceiptItemResponse;
  currencyCode: string;
  taxShare: number;
  categories: TaxCategoryResponse[];
  financeCategories: CategoryResponse[];
  storageSpaces: StorageSpaceResponse[];
  locked: boolean;
  catPending: boolean;
  financeCatPending: boolean;
  fieldPending: boolean;
  matchPending: boolean;
  onChangeCategory: (taxCategoryId: string | null) => void;
  onChangeFinanceCategory: (financeCategoryId: string | null) => void;
  onPatch: (data: UpdateReceiptItemInput) => void;
  onMatch: () => void;
  onUnmatch: () => void;
}

function ItemRow({
  item,
  currencyCode,
  taxShare,
  categories,
  financeCategories,
  storageSpaces,
  locked,
  catPending,
  financeCatPending,
  fieldPending,
  matchPending,
  onChangeCategory,
  onChangeFinanceCategory,
  onPatch,
  onMatch,
  onUnmatch,
}: ItemRowProps) {
  const [catValue, setCatValue] = useState(item.taxCategoryId ?? '');
  if (catValue !== (item.taxCategoryId ?? '') && !catPending) {
    setCatValue(item.taxCategoryId ?? '');
  }
  const [finCatValue, setFinCatValue] = useState(item.financeCategoryId ?? '');
  if (finCatValue !== (item.financeCategoryId ?? '') && !financeCatPending) {
    setFinCatValue(item.financeCategoryId ?? '');
  }
  const taxRateForRow = locked ? item.taxRate : item.taxCategoryRate;
  const allInPrice =
    locked && item.finalLineTotal != null
      ? item.finalLineTotal
      : item.lineTotal + taxShare;

  return (
    <tr className={cn('border-b border-border last:border-0', fieldPending && 'opacity-60')}>
      <td className="px-4 py-2">
        {item.productName ? (
          <div>
            <div className="font-medium">{item.productName}</div>
            <div className="text-xs text-muted-foreground">
              receipt: {item.rawName}
            </div>
          </div>
        ) : locked ? (
          <span>{item.rawName}</span>
        ) : (
          <Input
            defaultValue={item.rawName}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== item.rawName) onPatch({ rawName: v });
            }}
            className="h-8 text-sm"
          />
        )}
      </td>
      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.rawCode ?? '—'}</td>
      <td className="px-4 py-2 text-center">
        {item.taxCode ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-border font-mono text-xs">
            {item.taxCode}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">
            {item.taxCategoryName ?? '—'}
            {taxRateForRow != null && taxRateForRow > 0 && (
              <span className="ml-1 font-mono">({(taxRateForRow * 100).toFixed(2)}%)</span>
            )}
          </span>
        ) : (
          <Select
            value={catValue}
            disabled={catPending}
            onChange={(e) => {
              const next = e.target.value || null;
              setCatValue(e.target.value);
              onChangeCategory(next);
            }}
            className="h-8 text-xs"
          >
            <option value="">— Unassigned —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">{item.financeCategoryName ?? '—'}</span>
        ) : (
          <Select
            value={finCatValue}
            disabled={financeCatPending}
            onChange={(e) => {
              const next = e.target.value || null;
              setFinCatValue(e.target.value);
              onChangeFinanceCategory(next);
            }}
            className="h-8 text-xs"
          >
            <option value="">— Use receipt default —</option>
            {financeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">{item.storageSpaceName ?? '—'}</span>
        ) : (
          <Select
            value={item.storageSpaceId ?? ''}
            disabled={!item.productId}
            onChange={(e) => onPatch({ storageSpaceId: e.target.value || null })}
            className="h-8 text-xs"
            title={item.productId ? undefined : 'Match a product first to inventory this line'}
          >
            <option value="">— Use receipt default —</option>
            {storageSpaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">
            {item.expiryDate ? formatDate(item.expiryDate) : '—'}
          </span>
        ) : (
          <Input
            type="date"
            defaultValue={item.expiryDate ? item.expiryDate.slice(0, 10) : ''}
            onBlur={(e) => {
              const v = e.target.value;
              const next = v ? new Date(v + 'T12:00:00Z').toISOString() : null;
              if (next !== (item.expiryDate ?? null)) {
                onPatch({ expiryDate: next });
              }
            }}
            className="h-8 text-xs"
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {locked ? (
          <span className="font-mono">{item.quantity}</span>
        ) : (
          <NumberCell
            value={item.quantity}
            onSave={(v) => v != null && onPatch({ quantity: v })}
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {locked ? (
          <span className="font-mono">{formatCurrency(item.lineTotal, currencyCode)}</span>
        ) : (
          <NumberCell
            value={item.lineTotal}
            onSave={(v) => v != null && onPatch({ lineTotal: v })}
          />
        )}
      </td>
      <td className="px-4 py-2 text-right font-mono">
        {taxShare > 0 ? (
          <span title={`+ ${formatCurrency(taxShare, currencyCode)} tax`}>
            {formatCurrency(allInPrice, currencyCode)}
          </span>
        ) : (
          formatCurrency(allInPrice, currencyCode)
        )}
      </td>
      <td className="px-2 py-2 text-center">
        {locked ? null : item.productId ? (
          <button
            type="button"
            onClick={onUnmatch}
            disabled={matchPending}
            title="Unlink product"
            className="text-muted-foreground hover:text-foreground"
          >
            <Link2Off className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMatch}
            disabled={matchPending}
            title="Match to a product"
            className="text-muted-foreground hover:text-foreground"
          >
            <Link2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

interface GroupRowProps {
  group: ItemGroup;
  currencyCode: string;
  taxShares: Map<string, number>;
  categories: TaxCategoryResponse[];
  financeCategories: CategoryResponse[];
  storageSpaces: StorageSpaceResponse[];
  locked: boolean;
  catPending: boolean;
  financeCatPending: boolean;
  matchPending: boolean;
  onChangeCategory: (taxCategoryId: string | null) => void;
  onChangeFinanceCategory: (financeCategoryId: string | null) => void;
  onPatchAll: (data: UpdateReceiptItemInput) => void;
  onMatch: () => void;
  onUnmatch: () => void;
}

function GroupRow({
  group,
  currencyCode,
  taxShares,
  categories,
  financeCategories,
  storageSpaces,
  locked,
  catPending,
  financeCatPending,
  matchPending,
  onChangeCategory,
  onChangeFinanceCategory,
  onPatchAll,
  onMatch,
  onUnmatch,
}: GroupRowProps) {
  const first = group.items[0];
  const count = group.items.length;
  const totalQty = group.items.reduce((s, i) => s + i.quantity, 0);
  const totalPreTax = group.items.reduce((s, i) => s + i.lineTotal, 0);
  const totalTaxShare = group.items.reduce((s, i) => s + (taxShares.get(i.id) ?? 0), 0);
  const totalAllIn =
    locked && group.items.every((i) => i.finalLineTotal != null)
      ? group.items.reduce((s, i) => s + (i.finalLineTotal ?? 0), 0)
      : totalPreTax + totalTaxShare;

  const [catValue, setCatValue] = useState(first.taxCategoryId ?? '');
  if (catValue !== (first.taxCategoryId ?? '') && !catPending) {
    setCatValue(first.taxCategoryId ?? '');
  }
  const [finCatValue, setFinCatValue] = useState(first.financeCategoryId ?? '');
  if (finCatValue !== (first.financeCategoryId ?? '') && !financeCatPending) {
    setFinCatValue(first.financeCategoryId ?? '');
  }

  const taxRateForRow = locked ? first.taxRate : first.taxCategoryRate;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {first.productName ? (
            <div>
              <div className="font-medium">{first.productName}</div>
              <div className="text-xs text-muted-foreground">receipt: {first.rawName}</div>
            </div>
          ) : (
            <span>{first.rawName}</span>
          )}
          <Badge variant="secondary">× {count}</Badge>
        </div>
      </td>
      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{first.rawCode ?? '—'}</td>
      <td className="px-4 py-2 text-center">
        {first.taxCode ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-border font-mono text-xs">
            {first.taxCode}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">
            {first.taxCategoryName ?? '—'}
            {taxRateForRow != null && taxRateForRow > 0 && (
              <span className="ml-1 font-mono">({(taxRateForRow * 100).toFixed(2)}%)</span>
            )}
          </span>
        ) : (
          <Select
            value={catValue}
            disabled={catPending}
            onChange={(e) => {
              const next = e.target.value || null;
              setCatValue(e.target.value);
              onChangeCategory(next);
            }}
            className="h-8 text-xs"
          >
            <option value="">— Unassigned —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">{first.financeCategoryName ?? '—'}</span>
        ) : (
          <Select
            value={finCatValue}
            disabled={financeCatPending}
            onChange={(e) => {
              const next = e.target.value || null;
              setFinCatValue(e.target.value);
              onChangeFinanceCategory(next);
            }}
            className="h-8 text-xs"
          >
            <option value="">— Use receipt default —</option>
            {financeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">{first.storageSpaceName ?? '—'}</span>
        ) : (
          <Select
            value={first.storageSpaceId ?? ''}
            disabled={!first.productId}
            onChange={(e) => onPatchAll({ storageSpaceId: e.target.value || null })}
            className="h-8 text-xs"
            title={first.productId ? undefined : 'Match a product first'}
          >
            <option value="">— Use receipt default —</option>
            {storageSpaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}
      </td>
      <td className="px-4 py-2">
        {locked ? (
          <span className="text-xs text-muted-foreground">
            {first.expiryDate ? formatDate(first.expiryDate) : '—'}
          </span>
        ) : (
          <Input
            type="date"
            defaultValue={first.expiryDate ? first.expiryDate.slice(0, 10) : ''}
            onBlur={(e) => {
              const v = e.target.value;
              const next = v ? new Date(v + 'T12:00:00Z').toISOString() : null;
              if (next !== (first.expiryDate ?? null)) {
                onPatchAll({ expiryDate: next });
              }
            }}
            className="h-8 text-xs"
          />
        )}
      </td>
      <td className="px-4 py-2 text-right font-mono">{totalQty}</td>
      <td className="px-4 py-2 text-right font-mono">{formatCurrency(totalPreTax, currencyCode)}</td>
      <td className="px-4 py-2 text-right font-mono">{formatCurrency(totalAllIn, currencyCode)}</td>
      <td className="px-2 py-2 text-center">
        {locked ? null : first.productId ? (
          <button
            type="button"
            onClick={onUnmatch}
            disabled={matchPending}
            title="Unlink product (cascades to all rows in this group)"
            className="text-muted-foreground hover:text-foreground"
          >
            <Link2Off className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMatch}
            disabled={matchPending}
            title="Match to a product (cascades to all rows in this group)"
            className="text-muted-foreground hover:text-foreground"
          >
            <Link2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

interface AdjustmentsCardProps {
  adjustments: ReceiptAdjustmentResponse[];
  currencyCode: string;
  incomeCategories: CategoryResponse[];
  locked: boolean;
  onAdd: (input: { categoryId: string; amount: number; description?: string }) => void;
  onPatch: (
    adjId: string,
    data: { categoryId?: string; amount?: number; description?: string | null },
  ) => void;
  onDelete: (adjId: string) => void;
  pendingAdd: boolean;
}

function AdjustmentsCard({
  adjustments,
  currencyCode,
  incomeCategories,
  locked,
  onAdd,
  onPatch,
  onDelete,
  pendingAdd,
}: AdjustmentsCardProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  function reset() {
    setShowAdd(false);
    setCategoryId('');
    setAmount('');
    setDescription('');
  }

  function handleAdd() {
    const amt = parseFloat(amount);
    if (!categoryId || !amt || amt <= 0) return;
    onAdd({ categoryId, amount: amt, description: description.trim() || undefined });
    reset();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Adjustments (cashback, coupons, rebates)</CardTitle>
        {!locked && !showAdd && (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            Add adjustment
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adjustments.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">
            No adjustments. Use this for store cashback, coupons, manufacturer rebates — anything
            that reduced what you actually paid below the receipt total.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {adjustments.map((adj) => (
              <li key={adj.id} className="flex items-center justify-between py-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {locked ? (
                    <span className="text-sm">{adj.categoryName}</span>
                  ) : (
                    <Select
                      value={adj.categoryId}
                      onChange={(e) => onPatch(adj.id, { categoryId: e.target.value })}
                      className="h-8 text-sm"
                    >
                      {incomeCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  )}
                  {locked ? (
                    <span className="text-sm text-muted-foreground italic">
                      {adj.description ?? ''}
                    </span>
                  ) : (
                    <Input
                      defaultValue={adj.description ?? ''}
                      placeholder="Optional note"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (adj.description ?? '')) {
                          onPatch(adj.id, { description: v || null });
                        }
                      }}
                      className="h-8 text-sm"
                    />
                  )}
                  {locked ? (
                    <span className="text-sm text-right font-mono">
                      {formatCurrency(adj.amount, currencyCode)}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={adj.amount}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isNaN(v) && v > 0 && v !== adj.amount) {
                          onPatch(adj.id, { amount: v });
                        }
                      }}
                      className="h-8 text-right font-mono text-sm"
                    />
                  )}
                </div>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => onDelete(adj.id)}
                    className="ml-3 text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!locked && showAdd && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end border-t border-border pt-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Income category</span>
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-8 text-sm"
              >
                <option value="">— Select —</option>
                {incomeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Description (optional)</span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Walmart Rewards"
                className="h-8 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Amount</span>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-8 text-right font-mono text-sm"
              />
            </label>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!categoryId || !amount || pendingAdd}
              >
                {pendingAdd ? 'Adding…' : 'Add'}
              </Button>
            </div>
            {incomeCategories.length === 0 && (
              <p className="sm:col-span-3 text-xs text-destructive">
                No income categories yet. Add one in Finance → Categories first.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MoneyInput({
  value,
  disabled,
  onSave,
}: {
  value: number | null;
  disabled?: boolean;
  onSave: (v: number | null) => void;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      disabled={disabled}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const raw = e.target.value;
        const next = raw === '' ? null : parseFloat(raw);
        if (Number.isNaN(next as number)) return;
        if (next !== value) onSave(next);
      }}
      className="font-mono"
    />
  );
}

function NumberCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number | null) => void;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      defaultValue={value}
      onBlur={(e) => {
        const next = parseFloat(e.target.value);
        if (!Number.isNaN(next) && next !== value) onSave(next);
      }}
      className="h-8 w-24 text-right font-mono text-sm ml-auto"
    />
  );
}

function BackLink() {
  return (
    <Link
      to="/receipts"
      className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="mr-1 h-4 w-4" />
      Back to receipts
    </Link>
  );
}
