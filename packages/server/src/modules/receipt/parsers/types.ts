export interface ParsedReceiptItem {
  rawName: string;
  rawCode?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal: number;
}

export interface ParsedReceipt {
  store: string;
  parserVersion: string;
  purchasedAt?: Date;
  subtotal?: number;
  tax?: number;
  total?: number;
  items: ParsedReceiptItem[];
}

export interface ReceiptParser {
  storeKey: string;
  detect(text: string): number;
  parse(text: string): ParsedReceipt;
}
