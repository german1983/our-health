const EXCHANGE_RATE_API_URL = process.env.EXCHANGE_RATE_API_URL || 'https://api.frankfurter.app';

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export async function fetchLatestRates(
  baseCurrency: string,
  targetCurrencies: string[],
): Promise<{ base: string; date: string; rates: Record<string, number> } | null> {
  try {
    const targets = targetCurrencies.join(',');
    const response = await fetch(`${EXCHANGE_RATE_API_URL}/latest?from=${baseCurrency}&to=${targets}`);
    if (!response.ok) return null;

    const data = (await response.json()) as FrankfurterResponse;
    return {
      base: data.base,
      date: data.date,
      rates: data.rates,
    };
  } catch (err) {
    console.error('Exchange rate fetch error:', err);
    return null;
  }
}

export async function fetchHistoricalRate(
  baseCurrency: string,
  targetCurrency: string,
  date: string,
): Promise<number | null> {
  try {
    const response = await fetch(`${EXCHANGE_RATE_API_URL}/${date}?from=${baseCurrency}&to=${targetCurrency}`);
    if (!response.ok) return null;

    const data = (await response.json()) as FrankfurterResponse;
    return data.rates[targetCurrency] ?? null;
  } catch (err) {
    console.error('Historical rate fetch error:', err);
    return null;
  }
}
