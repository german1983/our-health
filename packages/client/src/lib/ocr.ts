import { createWorker, type Worker } from 'tesseract.js';

export interface OcrProgress {
  status: string;
  progress: number;
}

let cachedWorker: Worker | null = null;

async function getWorker(onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  if (cachedWorker) return cachedWorker;
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (typeof m.progress === 'number') {
        onProgress?.({ status: m.status, progress: m.progress });
      }
    },
  });
  cachedWorker = worker;
  return worker;
}

export async function runOcr(
  source: File | Blob | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(source);
  return data.text;
}

export async function disposeOcr(): Promise<void> {
  if (cachedWorker) {
    await cachedWorker.terminate();
    cachedWorker = null;
  }
}
