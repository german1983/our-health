import OpenAI from 'openai';
import type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from './types.js';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini';

const SYSTEM_PROMPT = `You parse grocery receipts into JSON.

The user sends OCR text from a grocery receipt. Extract:
- store: the store chain, normalized as "WALMART", "LOBLAWS", "FARM_BOY", or "UNKNOWN".
- purchasedAt: ISO 8601 date string if found on the receipt, else null.
- subtotal, tax, total: numeric totals if found, else null.
- items: array of line items. Each item has:
  - rawName: the description AS PRINTED (uppercase abbreviations are fine).
  - rawCode: the per-store SKU/UPC code printed next to the item (digits only), or null.
  - quantity: number (default 1).
  - unitPrice: price per unit, or null.
  - lineTotal: total dollar amount for that line.

Rules:
- Ignore header/footer text, store info, payment method, change due, loyalty messages, OCR garbage.
- For weighed items ("0.449 kg @ $49.98/kg ... $22.44"), quantity=kg, unitPrice=price per kg, lineTotal=the dollar amount.
- For "N @ $P.PP" multipliers, quantity=N, unitPrice=P.PP, lineTotal=N*P.PP.
- If a line is clearly OCR garbage (malformed code, missing price), skip it.
- Do NOT correct or invent item names — return them as printed.
- All numeric fields must be JSON numbers, not strings.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string' },
    purchasedAt: { type: ['string', 'null'] },
    subtotal: { type: ['number', 'null'] },
    tax: { type: ['number', 'null'] },
    total: { type: ['number', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rawName: { type: 'string' },
          rawCode: { type: ['string', 'null'] },
          quantity: { type: 'number' },
          unitPrice: { type: ['number', 'null'] },
          lineTotal: { type: 'number' },
        },
        required: ['rawName', 'rawCode', 'quantity', 'unitPrice', 'lineTotal'],
        additionalProperties: false,
      },
    },
  },
  required: ['store', 'purchasedAt', 'subtotal', 'tax', 'total', 'items'],
  additionalProperties: false,
} as const;

interface ModelResponse {
  store: string;
  purchasedAt: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  items: {
    rawName: string;
    rawCode: string | null;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
  }[];
}

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

export const openaiParser: ReceiptParser = {
  storeKey: 'OPENAI',
  // Not used for dispatch — selected by parsers/index.ts when OPENAI_API_KEY is set.
  detect: () => 0,

  async parse(text: string, hint?: string): Promise<ParsedReceipt> {
    const client = getClient();

    const userPrompt = hint
      ? `User hint: this receipt is likely from "${hint}". Verify against the text below.\n\n${text}`
      : text;

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt.slice(0, 12000) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'parsed_receipt',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('OpenAI returned an empty response');

    const parsed = JSON.parse(raw) as ModelResponse;

    const items: ParsedReceiptItem[] = parsed.items.map((i) => ({
      rawName: i.rawName,
      rawCode: i.rawCode ?? undefined,
      quantity: i.quantity,
      unitPrice: i.unitPrice ?? undefined,
      lineTotal: i.lineTotal,
    }));

    const purchasedAt = parsed.purchasedAt ? new Date(parsed.purchasedAt) : undefined;

    return {
      store: parsed.store,
      parserVersion: `openai:${MODEL}`,
      purchasedAt: purchasedAt && !isNaN(purchasedAt.getTime()) ? purchasedAt : undefined,
      subtotal: parsed.subtotal ?? undefined,
      tax: parsed.tax ?? undefined,
      total: parsed.total ?? undefined,
      items,
    };
  },
};
