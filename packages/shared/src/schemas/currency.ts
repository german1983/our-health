import { z } from 'zod';

export const convertCurrencySchema = z.object({
  amount: z.number().positive(),
  from: z.string().length(3),
  to: z.string().length(3),
  date: z.string().optional(),
});

export type ConvertCurrencyInput = z.infer<typeof convertCurrencySchema>;

export interface CurrencyResponse {
  code: string;
  name: string;
  symbol: string;
}

export interface ExchangeRateResponse {
  from: string;
  to: string;
  rate: number;
  date: string;
}

export interface ConvertCurrencyResponse {
  amount: number;
  from: string;
  to: string;
  result: number;
  rate: number;
  date: string;
}
