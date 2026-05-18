import OpenAI from 'openai';
import type { ParsedReceipt, ParsedReceiptItem } from './types.js';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini';

const SYSTEM_PROMPT = `You parse grocery receipts into structured JSON.

For each receipt:
- store: the chain name normalized as "WALMART", "LOBLAWS", "FARM_BOY", or "UNKNOWN".
- purchasedAt: ISO 8601 date string if a date is visible, else null.
- subtotal, tax, total: numeric amounts if visible, else null.
- items: each line item:
  - rawName: the description AS PRINTED on the receipt.
  - rawCode: the SKU/UPC code printed next to the item (digits only), or null.
  - quantity: number (default 1).
  - unitPrice: price per unit, or null.
  - lineTotal: total dollar amount for that line.
- transcript: a clean plain-text dump of the receipt's meaningful content (header line, items, totals). Skip OCR noise; use one item per line.

Rules:
- Ignore header/footer text that isn't useful (loyalty messages, payment method, change due, "thank you", etc).
- For weighed items ("0.449 kg @ $49.98/kg ... $22.44"), quantity=kg, unitPrice=price per kg, lineTotal=the dollar amount.
- For "N @ $P.PP" multipliers, quantity=N, unitPrice=P.PP, lineTotal=N*P.PP.
- All numeric fields must be JSON numbers, not strings.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string' },
    purchasedAt: { type: ['string', 'null'] },
    subtotal: { type: ['number', 'null'] },
    tax: { type: ['number', 'null'] },
    total: { type: ['number', 'null'] },
    transcript: { type: 'string' },
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
  required: ['store', 'purchasedAt', 'subtotal', 'tax', 'total', 'transcript', 'items'],
  additionalProperties: false,
} as const;

interface ModelResponse {
  store: string;
  purchasedAt: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  transcript: string;
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
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

function toParsedReceipt(model: ModelResponse): { parsed: ParsedReceipt; transcript: string } {
  const items: ParsedReceiptItem[] = model.items.map((i) => ({
    rawName: i.rawName,
    rawCode: i.rawCode ?? undefined,
    quantity: i.quantity,
    unitPrice: i.unitPrice ?? undefined,
    lineTotal: i.lineTotal,
  }));

  const purchasedAt = model.purchasedAt ? new Date(model.purchasedAt) : undefined;

  return {
    parsed: {
      store: model.store,
      parserVersion: `openai:${MODEL}`,
      purchasedAt: purchasedAt && !isNaN(purchasedAt.getTime()) ? purchasedAt : undefined,
      subtotal: model.subtotal ?? undefined,
      tax: model.tax ?? undefined,
      total: model.total ?? undefined,
      items,
    },
    transcript: model.transcript,
  };
}

const userInstruction = (hint?: string) =>
  hint
    ? `User hint: this receipt is from "${hint}". Verify against the image and parse it.`
    : 'Parse this receipt.';

export async function parseReceiptImage(
  imageDataUrl: string,
  hint?: string,
): Promise<{ parsed: ParsedReceipt; transcript: string }> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userInstruction(hint) },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'parsed_receipt', strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned an empty response');
  return toParsedReceipt(JSON.parse(raw) as ModelResponse);
}

export async function parseReceiptText(
  text: string,
  hint?: string,
): Promise<ParsedReceipt> {
  const client = getClient();

  const userPrompt = hint
    ? `User hint: this receipt is from "${hint}". Verify against the text below.\n\n${text}`
    : text;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt.slice(0, 12000) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'parsed_receipt', strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned an empty response');
  return toParsedReceipt(JSON.parse(raw) as ModelResponse).parsed;
}
