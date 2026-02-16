import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { fetchLatestRates, fetchHistoricalRate } from '../../integrations/exchange-rates.js';
import type { CurrencyResponse, ExchangeRateResponse, ConvertCurrencyInput, ConvertCurrencyResponse } from '@personal-budget/shared';

// Common currencies to seed
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
  const currencies = await prisma.currency.findMany({ orderBy: { code: 'asc' } });
  if (currencies.length === 0) {
    // Seed currencies on first call
    await prisma.currency.createMany({
      data: COMMON_CURRENCIES,
      skipDuplicates: true,
    });
    return COMMON_CURRENCIES;
  }
  return currencies;
}

export async function getRatesForHousehold(householdId: string): Promise<ExchangeRateResponse[]> {
  const household = await prisma.household.findUnique({ where: { id: householdId } });
  if (!household) throw new NotFoundError('Household');

  const householdCurrencies = await prisma.householdCurrency.findMany({
    where: { householdId },
  });

  const currencyCodes = householdCurrencies.map((hc) => hc.currencyCode);
  if (currencyCodes.length <= 1) return [];

  const baseCurrency = household.defaultCurrency;
  const targets = currencyCodes.filter((c) => c !== baseCurrency);

  if (targets.length === 0) return [];

  // Check if we have today's rates
  const today = new Date().toISOString().split('T')[0];
  const existingRates = await prisma.exchangeRate.findMany({
    where: {
      fromCurrency: baseCurrency,
      toCurrency: { in: targets },
      date: new Date(today),
    },
  });

  if (existingRates.length === targets.length) {
    return existingRates.map((r) => ({
      from: r.fromCurrency,
      to: r.toCurrency,
      rate: r.rate,
      date: r.date.toISOString().split('T')[0],
    }));
  }

  // Fetch fresh rates
  const fetched = await fetchLatestRates(baseCurrency, targets);
  if (!fetched) {
    // Return stale rates if available
    const stale = await prisma.exchangeRate.findMany({
      where: { fromCurrency: baseCurrency, toCurrency: { in: targets } },
      orderBy: { date: 'desc' },
      distinct: ['toCurrency'],
    });
    return stale.map((r) => ({
      from: r.fromCurrency,
      to: r.toCurrency,
      rate: r.rate,
      date: r.date.toISOString().split('T')[0],
    }));
  }

  // Store rates
  const rateDate = new Date(fetched.date);
  for (const [currency, rate] of Object.entries(fetched.rates)) {
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_date: {
          fromCurrency: baseCurrency,
          toCurrency: currency,
          date: rateDate,
        },
      },
      create: {
        fromCurrency: baseCurrency,
        toCurrency: currency,
        rate,
        date: rateDate,
      },
      update: { rate },
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

  let rate: number | null = null;
  const date = input.date || new Date().toISOString().split('T')[0];

  // Check stored rates
  const stored = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency: input.from,
      toCurrency: input.to,
      date: new Date(date),
    },
  });

  if (stored) {
    rate = stored.rate;
  } else {
    // Fetch from API
    if (input.date) {
      rate = await fetchHistoricalRate(input.from, input.to, input.date);
    } else {
      const fetched = await fetchLatestRates(input.from, [input.to]);
      rate = fetched?.rates[input.to] ?? null;
    }

    // Store for future use
    if (rate !== null) {
      await prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency_date: {
            fromCurrency: input.from,
            toCurrency: input.to,
            date: new Date(date),
          },
        },
        create: {
          fromCurrency: input.from,
          toCurrency: input.to,
          rate,
          date: new Date(date),
        },
        update: { rate },
      });
    }
  }

  if (rate === null) {
    throw new NotFoundError('Exchange rate');
  }

  return {
    amount: input.amount,
    from: input.from,
    to: input.to,
    result: Math.round(input.amount * rate * 100) / 100,
    rate,
    date,
  };
}
