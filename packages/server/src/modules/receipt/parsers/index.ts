import type { ParsedReceipt, ReceiptParser } from './types.js';
import { walmartParser } from './walmart.js';

const parsersByStore: Record<string, ReceiptParser> = {
  [walmartParser.storeKey]: walmartParser,
};

export const parsers: ReceiptParser[] = Object.values(parsersByStore);

export function parseReceipt(text: string, hint?: string): ParsedReceipt {
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
