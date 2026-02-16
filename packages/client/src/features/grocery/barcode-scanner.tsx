import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'barcode-reader';

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop();
      }
    };
  }, []);

  async function startScanning() {
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      setScanning(true);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          scanner.stop();
          setScanning(false);
          onScan(decodedText);
        },
        () => {}, // ignore errors during scanning
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setScanning(false);
    }
  }

  async function stopScanning() {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setScanning(false);
  }

  function handleManualSubmit() {
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
    }
  }

  return (
    <div className="space-y-4">
      <div id={containerId} className={scanning ? 'rounded-lg overflow-hidden' : 'hidden'} />

      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanning} variant="outline">
            Scan Barcode
          </Button>
        ) : (
          <Button onClick={stopScanning} variant="outline">
            Stop Scanning
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Or enter barcode manually"
          onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
        />
        <Button onClick={handleManualSubmit} variant="secondary">
          Lookup
        </Button>
      </div>
    </div>
  );
}
