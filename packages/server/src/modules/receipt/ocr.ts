import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

// Tesseract.js downloads language data (~10MB) on first use; on Vercel serverless
// each cold start re-fetches it from the CDN. For 3-4 receipts/week the latency
// hit is acceptable; revisit if it becomes painful.

export async function preprocessReceipt(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: 1600, withoutEnlargement: true })
    .toBuffer();
}

export async function extractText(buffer: Buffer): Promise<string> {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
