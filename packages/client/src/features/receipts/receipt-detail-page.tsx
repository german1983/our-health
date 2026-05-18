import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ReceiptResponse } from '@personal-budget/shared';

const TOLERANCE = 0.011; // accept rounding within 1¢

function near(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= TOLERANCE;
}

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: receipt, isLoading, error } = useQuery({
    queryKey: ['receipt', id],
    queryFn: () => api.get<ReceiptResponse>(`/receipts/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const sumLineTotals = useMemo(
    () => receipt?.items.reduce((sum, i) => sum + i.lineTotal, 0) ?? 0,
    [receipt],
  );

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
          <span>Totals reconcile. {receipt.items.length} items add up to the printed subtotal, plus tax matches the total.</span>
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
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    {item.productName ?? <span className="text-muted-foreground">{item.rawName}</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {item.rawCode ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {item.taxCode ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-border font-mono text-xs">
                        {item.taxCode}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{item.quantity}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {item.unitPrice != null ? formatCurrency(item.unitPrice, receipt.currencyCode) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(item.lineTotal, receipt.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border text-sm">
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={5}>
                  Subtotal
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.subtotal != null ? formatCurrency(receipt.subtotal, receipt.currencyCode) : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-right text-muted-foreground" colSpan={5}>
                  Tax
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {receipt.tax != null ? formatCurrency(receipt.tax, receipt.currencyCode) : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-right font-medium" colSpan={5}>
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
    </div>
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
