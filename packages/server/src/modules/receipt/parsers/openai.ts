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
  - rawCode: the SKU/UPC code printed next to the item (digits only), or null. If the line starts with a parenthesized quantity prefix like "(2)" or "(3)" followed by the code, drop the prefix and use the code (the quantity goes into the quantity field).
  - taxCode: the tax-category code printed on this line. It is one or more uppercase letters (often 1–4) and may appear EITHER between the description and the price (Loblaws style, e.g. "MRJ", "HMRJ", "RQ") OR at the far right (Walmart / Farm Boy style, e.g. "J", "H", "D", "E", "X", "G"). Capture the letters EXACTLY as printed; do NOT interpret what they mean and do NOT normalize case. Null when absent.
  - quantity: number (default 1).
  - unitPrice: price per single unit, or null.
  - lineTotal: total dollar amount for that line (always the rightmost dollar value).
- transcript: a clean plain-text dump of the receipt's meaningful content (header line, items with their tax codes, totals). Skip OCR noise; use one item per line.

Rules:
- Ignore header/footer text that isn't useful: department/section headers like "21-GROCERY", "22-DAIRY", "23-FROZEN", "27-PRODUCE", "36-HOME MEAL REPLACEMENT", loyalty messages, points-earned lines ("NO NAME EGGS 400 Pts"), payment method, card number, change due, "thank you", etc.
- For weighed items ("1.055 kg @ \$4.41/kg ... 4.65"), quantity = kg, unitPrice = price per kg, lineTotal = the printed dollar amount.
- For "N @ \$P.PP" multipliers, quantity = N, unitPrice = P.PP, lineTotal = the printed dollar total (which equals N × P.PP).
- For deal pricing like "2 @ 2/\$8.00" (the rightmost number is the printed line total, e.g. 8.00), quantity = 2, lineTotal = 8.00, unitPrice = effective per-unit price (8.00 ÷ 2 = 4.00). Ignore any "or" alternative pricing line that immediately precedes (e.g. "\$5.19 ea or 2/\$8.00 KB") — it is advisory, the @ line is authoritative.
- A line that prints points or loyalty units instead of dollars (e.g. "400 Pts") is not a purchased item — skip it.
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
          taxCode: { type: ['string', 'null'] },
          quantity: { type: 'number' },
          unitPrice: { type: ['number', 'null'] },
          lineTotal: { type: 'number' },
        },
        required: ['rawName', 'rawCode', 'taxCode', 'quantity', 'unitPrice', 'lineTotal'],
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
    taxCode: string | null;
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
    taxCode: i.taxCode ?? undefined,
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

/**
 * Kick off a background parse. Returns the OpenAI response id; the actual
 * parsing happens server-side at OpenAI and is retrieved later via
 * fetchReceiptParse. The HTTP round-trip here is just the upload of the
 * image — so this stays under Vercel's per-function timeout even on Hobby.
 */
export async function startReceiptParseFromImage(
  imageDataUrl: string,
  hint?: string,
): Promise<string> {
  const client = getClient();
  const response = await client.responses.create({
    model: MODEL,
    background: true,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userInstruction(hint) },
          { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'parsed_receipt',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  });
  return response.id;
}

export type ParseFetchStatus = 'pending' | 'completed' | 'failed';

export interface ParseFetchResult {
  status: ParseFetchStatus;
  parsed?: ParsedReceipt;
  transcript?: string;
  error?: string;
}

/**
 * Poll OpenAI for the background response. Maps OpenAI's lifecycle states
 * onto a simple tri-state: queued/in_progress -> pending, completed -> our
 * parsed payload, anything else -> failed (with the upstream message when
 * available so the UI can surface it).
 */
export async function fetchReceiptParse(responseId: string): Promise<ParseFetchResult> {
  const client = getClient();
  const response = await client.responses.retrieve(responseId);

  if (response.status === 'queued' || response.status === 'in_progress') {
    return { status: 'pending' };
  }
  if (response.status !== 'completed') {
    return {
      status: 'failed',
      error: response.error?.message ?? response.incomplete_details?.reason ?? response.status ?? 'failed',
    };
  }

  const raw = response.output_text;
  if (!raw) return { status: 'failed', error: 'OpenAI returned an empty response' };

  try {
    const { parsed, transcript } = toParsedReceipt(JSON.parse(raw) as ModelResponse);
    return { status: 'completed', parsed, transcript };
  } catch (err) {
    return { status: 'failed', error: `JSON parse error: ${(err as Error).message}` };
  }
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
