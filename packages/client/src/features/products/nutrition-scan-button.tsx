import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { compressImageToDataUrl } from '@/lib/image';
import type { NutritionScanResponse } from '@personal-budget/shared';

interface Props {
  /** Called with the AI-parsed result so the parent can fill its form fields. */
  onScanned: (result: NutritionScanResponse) => void;
  disabled?: boolean;
}

/**
 * One-click "scan a nutrition label" button. Opens the camera (on mobile)
 * or a file picker (on desktop), compresses the image to keep us under the
 * Vercel body cap, sends to /products/nutrition-scan, and hands the parsed
 * baseAmount / baseUnit / facts back to the parent to populate the form.
 */
export function NutritionScanButton({ onScanned, disabled }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file fires onChange again.
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setError(null);
    setPending(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const { data } = await api.post<NutritionScanResponse>('/products/nutrition-scan', {
        imageBase64: dataUrl,
      });
      onScanned(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Could not read this label.';
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFile}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={pending || disabled}
      >
        {pending ? 'Scanning…' : '📷 Scan label'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
