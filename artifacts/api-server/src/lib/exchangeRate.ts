export const EXCHANGE_RATE_API_URL = "https://open.er-api.com/v6/latest/KWD";
export const EXCHANGE_RATE_PROVIDER = "ExchangeRate-API Open Access";
export const EXCHANGE_RATE_ATTRIBUTION_URL = "https://www.exchangerate-api.com";
export const STRIPE_USD_MINIMUM_CENTS = 50;

const RATE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const RATE_CACHE_MS = 60 * 60 * 1000;
const MAX_UPDATE_INTERVAL_SECONDS = 36 * 60 * 60;
const REQUEST_TIMEOUT_MS = 7000;

export interface KwdUsdRate {
  usdPerKwd: number;
  updatedAt: Date;
  nextUpdateAt: Date;
}

interface CachedRate extends KwdUsdRate {
  cachedUntil: number;
}

let cachedRate: CachedRate | undefined;

export class ExchangeRateUnavailableError extends Error {
  constructor(message = "A current KWD-to-USD exchange rate is unavailable.") {
    super(message);
    this.name = "ExchangeRateUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateKwdUsdRatePayload(
  payload: unknown,
  nowMs = Date.now(),
): KwdUsdRate {
  if (!isRecord(payload) || payload.result !== "success") {
    throw new ExchangeRateUnavailableError();
  }

  const rates = payload.rates;
  const usdPerKwd = isRecord(rates) ? rates.USD : undefined;
  const lastUpdate = payload.time_last_update_unix;
  const nextUpdate = payload.time_next_update_unix;
  const endOfLife = payload.time_eol_unix;
  if (
    payload.base_code !== "KWD" ||
    typeof usdPerKwd !== "number" ||
    !Number.isFinite(usdPerKwd) ||
    usdPerKwd <= 0 ||
    typeof lastUpdate !== "number" ||
    !Number.isSafeInteger(lastUpdate) ||
    typeof nextUpdate !== "number" ||
    !Number.isSafeInteger(nextUpdate)
  ) {
    throw new ExchangeRateUnavailableError();
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const ageSeconds = nowSeconds - lastUpdate;
  if (
    ageSeconds < -60 ||
    ageSeconds * 1000 > RATE_MAX_AGE_MS ||
    nextUpdate <= lastUpdate ||
    nextUpdate - lastUpdate > MAX_UPDATE_INTERVAL_SECONDS ||
    (typeof endOfLife === "number" &&
      endOfLife > 0 &&
      endOfLife <= nowSeconds)
  ) {
    throw new ExchangeRateUnavailableError(
      "The KWD-to-USD exchange-rate data is stale or invalid.",
    );
  }

  return {
    usdPerKwd,
    updatedAt: new Date(lastUpdate * 1000),
    nextUpdateAt: new Date(nextUpdate * 1000),
  };
}

export function convertKwdFilsToUsdCents(
  amountFils: number,
  usdPerKwd: number,
): number {
  if (
    !Number.isSafeInteger(amountFils) ||
    amountFils <= 0 ||
    !Number.isFinite(usdPerKwd) ||
    usdPerKwd <= 0
  ) {
    throw new RangeError("The KWD amount or exchange rate is invalid.");
  }

  // 1 KWD = 1,000 fils and 1 USD = 100 cents.
  const centsBeforeRounding = (amountFils / 1000) * usdPerKwd * 100;
  const cents = Math.round(centsBeforeRounding);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("The converted USD amount is invalid.");
  }
  return cents;
}

export async function getKwdUsdRate(
  nowMs = Date.now(),
): Promise<KwdUsdRate> {
  if (cachedRate && nowMs < cachedRate.cachedUntil) {
    try {
      validateKwdUsdRatePayload(
        {
          result: "success",
          base_code: "KWD",
          rates: { USD: cachedRate.usdPerKwd },
          time_last_update_unix: Math.floor(cachedRate.updatedAt.getTime() / 1000),
          time_next_update_unix: Math.floor(cachedRate.nextUpdateAt.getTime() / 1000),
        },
        nowMs,
      );
      return {
        usdPerKwd: cachedRate.usdPerKwd,
        updatedAt: cachedRate.updatedAt,
        nextUpdateAt: cachedRate.nextUpdateAt,
      };
    } catch {
      cachedRate = undefined;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new ExchangeRateUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ExchangeRateUnavailableError();
    }

    const rate = validateKwdUsdRatePayload(payload, nowMs);
    cachedRate = { ...rate, cachedUntil: nowMs + RATE_CACHE_MS };
    return rate;
  } catch (error) {
    if (error instanceof ExchangeRateUnavailableError) throw error;
    throw new ExchangeRateUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
