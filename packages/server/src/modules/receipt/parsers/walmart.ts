import type { ParsedReceipt, ParsedReceiptItem, ReceiptParser } from './types.js';

const WALMART_KEYWORDS = ['walmart', 'wal-mart', 'walmart.ca', 'save money. live better'];

// Walmart Canada line items typically look like:
//   ITEM DESCRIPTION         006827430789       4.97 G
// Quantity-multiplier lines look like:  "2 @ 1.97" (precedes the priced line)
const ITEM_LINE = /^(?<name>[A-Z0-9 .'\-/&]+?)\s+(?<code>\d{4,14})\s+(?<price>\d{1,4}\.\d{2})\s*[A-Z]?$/;
const QTY_LINE = /^(?<qty>\d+)\s*[@xX]\s*(?<unit>\d{1,4}\.\d{2})$/;
const TOTAL_LINE = /^(?:TOTAL|GRAND TOTAL|BALANCE DUE)\s+\$?(?<total>\d{1,4}\.\d{2})/i;
const SUBTOTAL_LINE = /^SUB ?TOTAL\s+\$?(?<subtotal>\d{1,4}\.\d{2})/i;
const TAX_LINE = /^(?:HST|GST|PST|QST|TAX)\b.*?(?<tax>\d{1,4}\.\d{2})/i;
const DATE_LINE = /(?<d>\d{2}[\/-]\d{2}[\/-]\d{2,4})/;

function parseDateLoose(s: string): Date | undefined {
  const parts = s.split(/[\/-]/).map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  let [a, b, c] = parts;
  if (c < 100) c += 2000;
  // Walmart Canada receipts use MM/DD/YY
  const date = new Date(c, a - 1, b);
  return isNaN(date.getTime()) ? undefined : date;
}

export const walmartParser: ReceiptParser = {
  storeKey: 'WALMART',

  detect(text) {
    const lower = text.toLowerCase();
    const hits = WALMART_KEYWORDS.filter((k) => lower.includes(k)).length;
    return Math.min(hits / 2, 1);
  },

  parse(text) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const items: ParsedReceiptItem[] = [];
    let subtotal: number | undefined;
    let tax: number | undefined;
    let total: number | undefined;
    let purchasedAt: Date | undefined;
    let pendingQty: { qty: number; unit: number } | undefined;

    for (const line of lines) {
      const totalMatch = TOTAL_LINE.exec(line);
      if (totalMatch?.groups?.total) {
        total = parseFloat(totalMatch.groups.total);
        continue;
      }
      const subtotalMatch = SUBTOTAL_LINE.exec(line);
      if (subtotalMatch?.groups?.subtotal) {
        subtotal = parseFloat(subtotalMatch.groups.subtotal);
        continue;
      }
      const taxMatch = TAX_LINE.exec(line);
      if (taxMatch?.groups?.tax) {
        tax = (tax ?? 0) + parseFloat(taxMatch.groups.tax);
        continue;
      }
      if (!purchasedAt) {
        const dateMatch = DATE_LINE.exec(line);
        if (dateMatch?.groups?.d) {
          const parsed = parseDateLoose(dateMatch.groups.d);
          if (parsed) purchasedAt = parsed;
        }
      }

      const qtyMatch = QTY_LINE.exec(line);
      if (qtyMatch?.groups) {
        pendingQty = {
          qty: parseInt(qtyMatch.groups.qty, 10),
          unit: parseFloat(qtyMatch.groups.unit),
        };
        continue;
      }

      const itemMatch = ITEM_LINE.exec(line);
      if (itemMatch?.groups) {
        const lineTotal = parseFloat(itemMatch.groups.price);
        const quantity = pendingQty?.qty ?? 1;
        const unitPrice = pendingQty?.unit ?? lineTotal / Math.max(quantity, 1);
        items.push({
          rawName: itemMatch.groups.name.trim(),
          rawCode: itemMatch.groups.code,
          quantity,
          unitPrice,
          lineTotal,
        });
        pendingQty = undefined;
      }
    }

    return {
      store: 'WALMART',
      parserVersion: 'walmart-v1',
      items,
      subtotal,
      tax,
      total,
      purchasedAt,
    };
  },
};
