import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { runOcr, disposeOcr, type OcrProgress } from '@/lib/ocr';
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
  const [rawText, setRawText] = useState('');
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [storeHint, setStoreHint] = useState<SupportedReceiptStore>('WALMART');
  const [storeId, setStoreId] = useState<string>('');
  const [currency, setCurrency] = useState('CAD');

  useEffect(() => () => { void disposeOcr(); }, []);

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
    mutationFn: (body: {
      rawText: string;
      storeHint: SupportedReceiptStore;
      storeId?: string;
      currencyCode: string;
    }) => api.post<ReceiptResponse>('/receipts', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setFile(null);
      setRawText('');
      setOcrProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  async function handleExtract() {
    if (!file) return;
    setOcrRunning(true);
    setRawText('');
    try {
      const text = await runOcr(file, setOcrProgress);
      setRawText(text);
    } finally {
      setOcrRunning(false);
    }
  }

  function handleSubmit() {
    if (!rawText.trim()) return;
    submitMutation.mutate({
      rawText,
      storeHint,
      storeId: storeId || undefined,
      currencyCode: currency,
    });
  }

  const ocrPercent = useMemo(
    () => (ocrProgress ? Math.round(ocrProgress.progress * 100) : 0),
    [ocrProgress],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Receipts</h1>
      <p className="text-muted-foreground">
        Snap a receipt; OCR runs on this device and the parsed text is sent to the server.
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

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExtract} disabled={!file || ocrRunning}>
              {ocrRunning ? `Reading… ${ocrPercent}%` : 'Extract text'}
            </Button>
          </div>

          {ocrProgress && ocrRunning && (
            <div className="text-xs text-muted-foreground">
              {ocrProgress.status} — {ocrPercent}%
            </div>
          )}

          {rawText && (
            <>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
                placeholder="OCR output will appear here. Edit if needed before saving."
              />

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

              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? 'Saving…' : 'Save receipt'}
                </Button>
                <Button variant="outline" onClick={() => { setRawText(''); setFile(null); }}>
                  Discard
                </Button>
              </div>

              {submitMutation.error && (
                <p className="text-sm text-destructive">
                  {(submitMutation.error as { response?: { data?: { error?: string } } })
                    .response?.data?.error || 'Failed to save receipt'}
                </p>
              )}
            </>
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
              <div key={r.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
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
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
