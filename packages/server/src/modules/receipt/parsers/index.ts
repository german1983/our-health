import { openaiParser } from './openai.js';
import type { ParsedReceipt, ReceiptParser } from './types.js';
import { walmartParser } from './walmart.js';

const parsersByStore: Record<string, ReceiptParser> = {
  [walmartParser.storeKey]: walmartParser,
};

export const parsers: ReceiptParser[] = Object.values(parsersByStore);

export async function parseReceipt(text: string, hint?: string): Promise<ParsedReceipt> {
  // Prefer LLM parsing when an API key is configured — handles all stores,
  // weighed items, and OCR slop without per-store regex maintenance.
  if (process.env.OPENAI_API_KEY) {
    return openaiParser.parse(text, hint);
  }

  if (hint && parsersByStore[hint]) {
    return parsersByStore[hint].parse(text);
  }

  let best: { parser: ReceiptParser; score: number } | undefined;
  for (const parser of parsers) {
    const score = parser.detect(text);
    if (!best || score > best.score) {
      best = { parser, score };
    }
  }

  if (best && best.score > 0) {
    return best.parser.parse(text);
  }

  return {
    store: 'UNKNOWN',
    parserVersion: 'none',
    items: [],
  };
}

export type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from './types.js';
