import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { compressImageToDataUrl } from '@/lib/image';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  CreateManualReceiptInput,
  PaymentMethodResponse,
  ReceiptResponse,
  StorageSpaceResponse,
  StoreResponse,
  SupportedReceiptStore,
} from '@personal-budget/shared';

const STORE_OPTIONS: SupportedReceiptStore[] = ['WALMART', 'LOBLAWS', 'FARM_BOY'];

export function ReceiptsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storeHint, setStoreHint] = useState<SupportedReceiptStore>('WALMART');
  const [storeId, setStoreId] = useState<string>('');
  const [currency, setCurrency] = useState('CAD');
  const [showManual, setShowManual] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  const [manualPurchasedAt, setManualPurchasedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [manualStoreId, setManualStoreId] = useState('');
  const [manualCurrency, setManualCurrency] = useState('CAD');
  const [manualPaymentMethodId, setManualPaymentMethodId] = useState('');
  const [manualStorageSpaceId, setManualStorageSpaceId] = useState('');
  const [manualSubtotal, setManualSubtotal] = useState('');
  const [manualTax, setManualTax] = useState('');
  const [manualTotal, setManualTotal] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.get<StoreResponse[]>('/stores').then((r) => r.data),
  });

  const { data: receipts } = useQuery({
    queryKey: ['receipts'],
    queryFn: () => api.get<ReceiptResponse[]>('/receipts').then((r) => r.data),
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.get<PaymentMethodResponse[]>('/payment-methods').then((r) => r.data),
    enabled: showManual,
    staleTime: 60_000,
  });

  const { data: storageSpaces } = useQuery({
    queryKey: ['storage', 'spaces'],
    queryFn: () => api.get<StorageSpaceResponse[]>('/storage/spaces').then((r) => r.data),
    enabled: showManual,
    staleTime: 60_000,
  });

  const manualMutation = useMutation({
    mutationFn: async (input: CreateManualReceiptInput) => {
      const { data } = await api.post<ReceiptResponse>('/receipts/manual', input);
      return data;
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setShowManual(false);
      resetManualForm();
      navigate(`/receipts/${receipt.id}`);
    },
  });

  function resetManualForm() {
    setManualDescription('');
    setManualStoreId('');
    setManualPaymentMethodId('');
    setManualStorageSpaceId('');
    setManualSubtotal('');
    setManualTax('');
    setManualTotal('');
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    const subtotal = manualSubtotal ? parseFloat(manualSubtotal) : null;
    const tax = manualTax ? parseFloat(manualTax) : null;
    const total = manualTotal ? parseFloat(manualTotal) : null;
    manualMutation.mutate({
      purchasedAt: manualPurchasedAt
        ? new Date(manualPurchasedAt + 'T12:00:00Z').toISOString()
        : undefined,
      storeId: manualStoreId || undefined,
      currencyCode: manualCurrency,
      paymentMethodId: manualPaymentMethodId || undefined,
      defaultStorageSpaceId: manualStorageSpaceId || undefined,
      description: manualDescription || undefined,
      subtotal,
      tax,
      total,
    });
  }

  const submitMutation = useMutation({
    mutationFn: async (input: { file: File; storeHint: SupportedReceiptStore; storeId?: string; currencyCode: string }) => {
      const imageBase64 = await compressImageToDataUrl(input.file);
      const { data } = await api.post<ReceiptResponse>('/receipts', {
        imageBase64,
        storeHint: input.storeHint,
        storeId: input.storeId,
        currencyCode: input.currencyCode,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  function handleSubmit() {
    if (!file) return;
    submitMutation.mutate({
      file,
      storeHint,
      storeId: storeId || undefined,
      currencyCode: currency,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Receipt className="h-6 w-6 sm:h-7 sm:w-7 text-finance" />
          Receipts
        </h1>
        <Button variant="outline" onClick={() => setShowManual(true)}>
          Add manual receipt
        </Button>
      </div>
      <p className="text-muted-foreground">
        Snap a receipt; the image is compressed on this device and sent to the parser.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan a receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground"
          />

          {previewUrl && (
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="max-h-80 rounded-md border border-border object-contain"
            />
          )}

          {file && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Store chain</span>
                <Select value={storeHint} onChange={(e) => setStoreHint(e.target.value as SupportedReceiptStore)}>
                  {STORE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </Select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Linked store</span>
                <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">— none —</option>
                  {stores?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Currency</span>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}>
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </Select>
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!file || submitMutation.isPending}>
              {submitMutation.isPending ? 'Parsing…' : 'Save receipt'}
            </Button>
            {file && (
              <Button variant="outline" onClick={() => setFile(null)}>
                Discard
              </Button>
            )}
          </div>

          {submitMutation.error && (
            <div className="text-sm text-destructive space-y-1">
              <p>
                {(submitMutation.error as { response?: { data?: { error?: string } } })
                  .response?.data?.error || 'Failed to save receipt'}
              </p>
              {(submitMutation.error as {
                response?: { data?: { details?: { path: string; message: string }[] } };
              }).response?.data?.details?.map((d, i) => (
                <p key={i} className="text-xs">
                  · {d.path}: {d.message}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!receipts || receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts yet.</p>
          ) : (
            receipts.map((r) => (
              <Link
                key={r.id}
                to={`/receipts/${r.id}`}
                className="flex items-center justify-between border-b border-border py-2 last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded-sm transition-colors"
              >
                <div>
                  <div className="font-medium">
                    {r.chainName ?? r.storeName ?? r.chainKey ?? 'Unknown'}{' '}
                    <Badge variant={r.status === 'PARSED' ? 'default' : 'secondary'}>{r.status}</Badge>
                    {r.parserVersion === 'manual' && (
                      <Badge variant="outline" className="ml-1">Manual</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.purchasedAt ? formatDate(r.purchasedAt) : formatDate(r.createdAt)} · {r.items.length} items
                  </div>
                </div>
                <div className="text-sm font-mono">
                  {r.total != null ? formatCurrency(r.total, r.currencyCode) : '—'}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* Manual Receipt Dialog */}
      <Dialog open={showManual} onClose={() => setShowManual(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add manual receipt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleManualSubmit}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For purchases without a paper receipt — Amazon, online orders, etc. You'll add
              items on the next screen.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Purchased on</span>
                <Input
                  type="date"
                  value={manualPurchasedAt}
                  onChange={(e) => setManualPurchasedAt(e.target.value)}
                  required
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Description</span>
                <Input
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="e.g., Amazon order #..."
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Store (optional)</span>
                <Select value={manualStoreId} onChange={(e) => setManualStoreId(e.target.value)}>
                  <option value="">— none —</option>
                  {stores?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Currency</span>
                <Select
                  value={manualCurrency}
                  onChange={(e) => setManualCurrency(e.target.value.toUpperCase())}
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </Select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Payment method (optional)</span>
                <Select
                  value={manualPaymentMethodId}
                  onChange={(e) => setManualPaymentMethodId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {paymentMethods?.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </Select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Default storage (optional)</span>
                <Select
                  value={manualStorageSpaceId}
                  onChange={(e) => setManualStorageSpaceId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {storageSpaces?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Subtotal</span>
                <Input
                  type="number"
                  step="0.01"
                  value={manualSubtotal}
                  onChange={(e) => setManualSubtotal(e.target.value)}
                  placeholder="—"
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Tax</span>
                <Input
                  type="number"
                  step="0.01"
                  value={manualTax}
                  onChange={(e) => setManualTax(e.target.value)}
                  placeholder="—"
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">Total</span>
                <Input
                  type="number"
                  step="0.01"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  placeholder="—"
                />
              </label>
            </div>
            {manualMutation.error && (
              <p className="text-sm text-destructive">
                {(manualMutation.error as { response?: { data?: { error?: string } } }).response?.data
                  ?.error || 'Failed to create receipt'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowManual(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={manualMutation.isPending}>
              {manualMutation.isPending ? 'Creating...' : 'Create & add items'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
