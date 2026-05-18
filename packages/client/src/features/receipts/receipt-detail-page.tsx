import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Lock, Unlock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type {
  ReceiptItemResponse,
  ReceiptResponse,
  StoreResponse,
  TaxCategoryResponse,
  UpdateReceiptInput,
  UpdateReceiptItemInput,
} from '@personal-budget/shared';

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

  const unlock = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ReceiptResponse>(`/receipts/${id}/unlock`);
      return data;
    },
    onSuccess: onReceiptUpdate,
  });

  const sumLineTotals = useMemo(
    () => receipt?.items.reduce((sum, i) => sum + i.lineTotal, 0) ?? 0,
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
          <h1 className="text-3xl font-bold">{receipt.store}</h1>
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
          <span>Totals reconcile. {receipt.items.length} items, math checks out.</span>
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
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2 text-center">Tax</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Pre-tax</th>
                <th className="px-4 py-2 text-right">All-in</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  currencyCode={receipt.currencyCode}
                  taxShare={taxShares.get(item.id) ?? 0}
                  categories={taxCategories ?? []}
                  locked={locked}
                  catPending={setCategory.isPending && setCategory.variables?.itemId === item.id}
                  fieldPending={patchItem.isPending && patchItem.variables?.itemId === item.id}
                  onChangeCategory={(taxCategoryId) =>
                    setCategory.mutate({ itemId: item.id, taxCategoryId })
                  }
                  onPatch={(data) => patchItem.mutate({ itemId: item.id, data })}
                />
              ))}
            </tbody>
            <tfoot className="border-t border-border text-sm">
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={6}>Subtotal</td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.subtotal != null ? formatCurrency(receipt.subtotal, receipt.currencyCode) : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={6}>Tax</td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.tax != null ? formatCurrency(receipt.tax, receipt.currencyCode) : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-right font-medium" colSpan={6}>Total</td>
                <td className="px-4 py-2 text-right font-mono font-medium">
                  {receipt.total != null ? formatCurrency(receipt.total, receipt.currencyCode) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

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

      {(confirm.error || unlock.error || patchReceipt.error || patchItem.error || setCategory.error) && (
        <p className="text-sm text-destructive">
          {(
            (confirm.error || unlock.error || patchReceipt.error || patchItem.error || setCategory.error) as {
              response?: { data?: { error?: string } };
            }
          ).response?.data?.error || 'Update failed'}
        </p>
      )}
    </div>
  );
}

interface ItemRowProps {
  item: ReceiptItemResponse;
  currencyCode: string;
  taxShare: number;
  categories: TaxCategoryResponse[];
  locked: boolean;
  catPending: boolean;
  fieldPending: boolean;
  onChangeCategory: (taxCategoryId: string | null) => void;
  onPatch: (data: UpdateReceiptItemInput) => void;
}

function ItemRow({
  item,
  currencyCode,
  taxShare,
  categories,
  locked,
  catPending,
  fieldPending,
  onChangeCategory,
  onPatch,
}: ItemRowProps) {
  const [catValue, setCatValue] = useState(item.taxCategoryId ?? '');
  if (catValue !== (item.taxCategoryId ?? '') && !catPending) {
    setCatValue(item.taxCategoryId ?? '');
  }

  const displayName = item.productName ?? item.rawName;
  const taxRateForRow = locked ? item.taxRate : item.taxCategoryRate;
  const allInPrice =
    locked && item.finalLineTotal != null
      ? item.finalLineTotal
      : item.lineTotal + taxShare;

  return (
    <tr className={cn('border-b border-border last:border-0', fieldPending && 'opacity-60')}>
      <td className="px-4 py-2">
        {locked ? (
          <span>{displayName}</span>
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
    </tr>
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
