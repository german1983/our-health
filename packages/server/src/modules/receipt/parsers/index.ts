import type { ParsedReceipt } from './types.js';
import { parseReceiptImage, parseReceiptText } from './openai.js';

export async function parseReceiptFromImage(
  imageDataUrl: string,
  hint?: string,
): Promise<{ parsed: ParsedReceipt; transcript: string }> {
  return parseReceiptImage(imageDataUrl, hint);
}

export async function parseReceiptFromText(text: string, hint?: string): Promise<ParsedReceipt> {
  return parseReceiptText(text, hint);
}

export type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from './types.js';
