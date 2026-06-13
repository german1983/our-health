import type { ParsedReceipt } from './types.js';
import {
  fetchReceiptParse,
  parseReceiptText,
  startReceiptParseFromImage,
} from './openai.js';

export async function parseReceiptFromText(text: string, hint?: string): Promise<ParsedReceipt> {
  return parseReceiptText(text, hint);
}

export { startReceiptParseFromImage, fetchReceiptParse };
export type { ParseFetchResult, ParseFetchStatus } from './openai.js';
export type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from './types.js';
