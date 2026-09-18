import { AppError } from './errors.js';

const VALID_UNITS = new Set(['standard', 'metric', 'imperial']);

function booleanSetting(value, fallback = true) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function positiveInteger(value, fallback, name) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed <= 0) {
    throw new AppError(`${name} must be a positive integer.`, {
      code: 'INVALID_CONFIGURATION',
      status: 500,
    });
  }
  return parsed;
}

export function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env = process.env) {
  const units = (env.WEATHER_UNITS || 'metric').toLowerCase();
  if (!VALID_UNITS.has(units)) {
    throw new AppError('WEATHER_UNITS must be standard, metric, or imperial.', {
      code: 'INVALID_CONFIGURATION',
      status: 500,
    });
  }

  const defaultTimeZone = env.DEFAULT_TIME_ZONE || 'UTC';
  if (!isValidTimeZone(defaultTimeZone)) {
    throw new AppError('DEFAULT_TIME_ZONE is not a valid IANA time zone.', {
      code: 'INVALID_CONFIGURATION',
      status: 500,
    });
  }

  return Object.freeze({
    port: positiveInteger(env.PORT, 8080, 'PORT'),
    nodeEnv: env.NODE_ENV || 'development',
    openWeatherApiKey: env.OPENWEATHER_API_KEY?.trim() || '',
    openMeteoFallback: booleanSetting(env.OPEN_METEO_FALLBACK, true),
    units,
    language: (env.WEATHER_LANGUAGE || 'en').trim().slice(0, 5),
    defaultTimeZone,
    webhookSecret: env.WEBHOOK_SECRET?.trim() || '',
    upstreamTimeoutMs: Math.min(
      positiveInteger(env.UPSTREAM_TIMEOUT_MS, 3500, 'UPSTREAM_TIMEOUT_MS'),
      4500,
    ),
    geocodeCacheTtlMs: positiveInteger(
      env.GEOCODE_CACHE_TTL_MS,
      86_400_000,
      'GEOCODE_CACHE_TTL_MS',
    ),
    weatherCacheTtlMs: positiveInteger(
      env.WEATHER_CACHE_TTL_MS,
      300_000,
      'WEATHER_CACHE_TTL_MS',
    ),
  });
}
