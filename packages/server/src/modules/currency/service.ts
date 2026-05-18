import { and, eq, inArray, desc, asc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { currencies, households, householdCurrencies, exchangeRates } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { fetchLatestRates, fetchHistoricalRate } from '../../integrations/exchange-rates.js';
import type {
  CurrencyResponse,
  ExchangeRateResponse,
  ConvertCurrencyInput,
  ConvertCurrencyResponse,
} from '@personal-budget/shared';

const COMMON_CURRENCIES: CurrencyResponse[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'COP', name: 'Colombian Peso', symbol: 'COL$' },
  { code: 'ARS', name: 'Argentine Peso', symbol: 'AR$' },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CL$' },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' },
];

export async function getCurrencies(): Promise<CurrencyResponse[]> {
  const rows = await db.query.currencies.findMany({ orderBy: asc(currencies.code) });
  if (rows.length === 0) {
    await db.insert(currencies).values(COMMON_CURRENCIES).onConflictDoNothing();
    return COMMON_CURRENCIES;
  }
  return rows;
}

export async function getRatesForHousehold(householdId: string): Promise<ExchangeRateResponse[]> {
  const household = await db.query.households.findFirst({ where: eq(households.id, householdId) });
  if (!household) throw new NotFoundError('Household');

  const houseCurrencies = await db.query.householdCurrencies.findMany({
    where: eq(householdCurrencies.householdId, householdId),
  });

  const currencyCodes = houseCurrencies.map((hc) => hc.currencyCode);
  if (currencyCodes.length <= 1) return [];

  const baseCurrency = household.defaultCurrency;
  const targets = currencyCodes.filter((c) => c !== baseCurrency);
  if (targets.length === 0) return [];

  const today = new Date(new Date().toISOString().split('T')[0]);

  const existing = await db.query.exchangeRates.findMany({
    where: and(
      eq(exchangeRates.fromCurrency, baseCurrency),
      inArray(exchangeRates.toCurrency, targets),
      eq(exchangeRates.date, today),
    ),
  });

  if (existing.length === targets.length) {
    return existing.map((r) => ({
      from: r.fromCurrency,
      to: r.toCurrency,
      rate: r.rate,
      date: r.date.toISOString().split('T')[0],
    }));
  }

  const fetched = await fetchLatestRates(baseCurrency, targets);
  if (!fetched) {
    const stale = await db
      .selectDistinctOn([exchangeRates.toCurrency], {
        fromCurrency: exchangeRates.fromCurrency,
        toCurrency: exchangeRates.toCurrency,
        rate: exchangeRates.rate,
        date: exchangeRates.date,
      })
      .from(exchangeRates)
      .where(
        and(eq(exchangeRates.fromCurrency, baseCurrency), inArray(exchangeRates.toCurrency, targets)),
      )
      .orderBy(exchangeRates.toCurrency, desc(exchangeRates.date));

    return stale.map((r) => ({
      from: r.fromCurrency,
      to: r.toCurrency,
      rate: r.rate,
      date: r.date.toISOString().split('T')[0],
    }));
  }

  const rateDate = new Date(fetched.date);
  for (const [currency, rate] of Object.entries(fetched.rates)) {
    await db
      .insert(exchangeRates)
      .values({ fromCurrency: baseCurrency, toCurrency: currency, rate, date: rateDate })
      .onConflictDoUpdate({
        target: [exchangeRates.fromCurrency, exchangeRates.toCurrency, exchangeRates.date],
        set: { rate },
      });
  }

  return Object.entries(fetched.rates).map(([currency, rate]) => ({
    from: baseCurrency,
    to: currency,
    rate,
    date: fetched.date,
  }));
}

export async function convertCurrency(input: ConvertCurrencyInput): Promise<ConvertCurrencyResponse> {
  if (input.from === input.to) {
    return {
      amount: input.amount,
      from: input.from,
      to: input.to,
      result: input.amount,
      rate: 1,
      date: input.date || new Date().toISOString().split('T')[0],
    };
  }

  const date = input.date || new Date().toISOString().split('T')[0];
  const dateObj = new Date(date);

  let rate: number | null = null;
  const stored = await db.query.exchangeRates.findFirst({
    where: and(
      eq(exchangeRates.fromCurrency, input.from),
      eq(exchangeRates.toCurrency, input.to),
      eq(exchangeRates.date, dateObj),
    ),
  });

  if (stored) {
    rate = stored.rate;
  } else {
    if (input.date) {
      rate = await fetchHistoricalRate(input.from, input.to, input.date);
    } else {
      const fetched = await fetchLatestRates(input.from, [input.to]);
      rate = fetched?.rates[input.to] ?? null;
    }

    if (rate !== null) {
      await db
        .insert(exchangeRates)
        .values({ fromCurrency: input.from, toCurrency: input.to, rate, date: dateObj })
        .onConflictDoUpdate({
          target: [exchangeRates.fromCurrency, exchangeRates.toCurrency, exchangeRates.date],
          set: { rate },
        });
    }
  }

  if (rate === null) throw new NotFoundError('Exchange rate');

  return {
    amount: input.amount,
    from: input.from,
    to: input.to,
    result: Math.round(input.amount * rate * 100) / 100,
    rate,
    date,
  };
}
