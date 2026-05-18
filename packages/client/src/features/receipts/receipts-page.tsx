import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { compressImageToDataUrl } from '@/lib/image';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  ReceiptResponse,
  StoreResponse,
  SupportedReceiptStore,
} from '@personal-budget/shared';

const STORE_OPTIONS: SupportedReceiptStore[] = ['WALMART', 'LOBLAWS', 'FARM_BOY'];

export function ReceiptsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storeHint, setStoreHint] = useState<SupportedReceiptStore>('WALMART');
  const [storeId, setStoreId] = useState<string>('');
  const [currency, setCurrency] = useState('CAD');

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
      <h1 className="text-3xl font-bold">Receipts</h1>
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
                    {r.store} <Badge variant={r.status === 'PARSED' ? 'default' : 'secondary'}>{r.status}</Badge>
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
    </div>
  );
}
