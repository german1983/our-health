import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type {
  ReceiptItemResponse,
  ReceiptResponse,
  TaxCategoryResponse,
} from '@personal-budget/shared';

const TOLERANCE = 0.011;

function near(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= TOLERANCE;
}

// Distribute the receipt's printed tax across taxed items proportionally
// to their lineTotal. Items without a taxCategory or with rate 0 get no
// share. Returns a map from itemId -> tax share (in dollars).
function distributeTax(receipt: ReceiptResponse): Map<string, number> {
  const shares = new Map<string, number>();
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

  const setCategory = useMutation({
    mutationFn: async (input: { itemId: string; taxCategoryId: string | null }) => {
      const { data } = await api.patch<ReceiptResponse>(
        `/receipts/items/${input.itemId}/tax-category`,
        {
          taxCategoryId: input.taxCategoryId,
          applyToChain: true,
          applyToReceipt: true,
        },
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['receipt', id], data);
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });

  const sumLineTotals = useMemo(
    () => receipt?.items.reduce((sum, i) => sum + i.lineTotal, 0) ?? 0,
    [receipt],
  );

  const taxShares = useMemo(() => (receipt ? distributeTax(receipt) : new Map()), [receipt]);

  const subtotalMatches = near(sumLineTotals, receipt?.subtotal);
  const totalMatches =
    receipt?.subtotal != null && receipt?.tax != null && receipt?.total != null
      ? near(receipt.subtotal + receipt.tax, receipt.total)
      : false;
  const allGood = subtotalMatches && totalMatches;

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

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{receipt.store}</h1>
          <p className="text-sm text-muted-foreground">
            {receipt.purchasedAt ? formatDate(receipt.purchasedAt) : formatDate(receipt.createdAt)}
            {' · '}
            <Badge variant={receipt.status === 'PARSED' ? 'default' : 'secondary'}>
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

      <div
        className={cn(
          'rounded-md border p-3 text-sm',
          allGood
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        {allGood ? (
          <span>
            Totals reconcile. {receipt.items.length} items add up to the printed subtotal, plus tax matches the total.
          </span>
        ) : (
          <div className="space-y-1">
            <div className="font-medium">Numbers don't reconcile</div>
            {!subtotalMatches && (
              <div>
                · Items sum to <strong>{formatCurrency(sumLineTotals, receipt.currencyCode)}</strong>,
                printed subtotal is{' '}
                <strong>
                  {receipt.subtotal != null
                    ? formatCurrency(receipt.subtotal, receipt.currencyCode)
                    : '—'}
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
                  pending={setCategory.isPending && setCategory.variables?.itemId === item.id}
                  onChangeCategory={(taxCategoryId) =>
                    setCategory.mutate({ itemId: item.id, taxCategoryId })
                  }
                />
              ))}
            </tbody>
            <tfoot className="border-t border-border text-sm">
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={6}>
                  Subtotal
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.subtotal != null
                    ? formatCurrency(receipt.subtotal, receipt.currencyCode)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={6}>
                  Tax
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.tax != null ? formatCurrency(receipt.tax, receipt.currencyCode) : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-right font-medium" colSpan={6}>
                  Total
                </td>
                <td className="px-4 py-2 text-right font-mono font-medium">
                  {receipt.total != null ? formatCurrency(receipt.total, receipt.currencyCode) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {setCategory.error && (
        <p className="text-sm text-destructive">
          {(setCategory.error as { response?: { data?: { error?: string } } })
            .response?.data?.error || 'Failed to update tax category'}
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
  pending: boolean;
  onChangeCategory: (taxCategoryId: string | null) => void;
}

function ItemRow({ item, currencyCode, taxShare, categories, pending, onChangeCategory }: ItemRowProps) {
  const [value, setValue] = useState(item.taxCategoryId ?? '');

  // Keep local select in sync when server data updates after a mutation.
  if (value !== (item.taxCategoryId ?? '') && !pending) {
    setValue(item.taxCategoryId ?? '');
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2">
        {item.productName ?? <span className="text-muted-foreground">{item.rawName}</span>}
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
        <Select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value || null;
            setValue(e.target.value);
            onChangeCategory(next);
          }}
          className="h-8 text-xs"
        >
          <option value="">— Unassigned —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-2 text-right font-mono">{item.quantity}</td>
      <td className="px-4 py-2 text-right font-mono">
        {formatCurrency(item.lineTotal, currencyCode)}
      </td>
      <td className="px-4 py-2 text-right font-mono">
        {taxShare > 0 ? (
          <span title={`+ ${formatCurrency(taxShare, currencyCode)} tax`}>
            {formatCurrency(item.lineTotal + taxShare, currencyCode)}
          </span>
        ) : (
          formatCurrency(item.lineTotal, currencyCode)
        )}
      </td>
    </tr>
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
