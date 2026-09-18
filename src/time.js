import { AppError } from './errors.js';
import { isValidTimeZone } from './config.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function todayInTimeZone(timeZone, now = new Date()) {
  return dateInTimeZone(now, timeZone);
}

export function extractSessionTimeZone(request, fallback = 'UTC') {
  const payload = request?.originalDetectIntentRequest?.payload ?? {};
  const diagnostic = request?.queryResult?.diagnosticInfo ?? {};
  const parameters = request?.queryResult?.parameters ?? {};

  const candidates = [
    payload.timeZone,
    payload.timezone,
    payload.user?.timeZone,
    payload.user?.timezone,
    payload.device?.timeZone,
    payload.device?.timezone,
    diagnostic.timeZone,
    diagnostic.time_zone,
    parameters.timeZone,
    parameters.timezone,
    parameters['time-zone'],
  ];

  return candidates.find((candidate) =>
    typeof candidate === 'string' && isValidTimeZone(candidate),
  ) ?? fallback;
}

export function normalizeDialogflowDate(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'object') {
    const nested = value.startDate ?? value.startDateTime ?? value.date ?? value.start;
    return normalizeDialogflowDate(nested);
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const isoPrefix = trimmed.slice(0, 10);
  if (!ISO_DATE.test(isoPrefix)) return null;

  const parsed = new Date(`${isoPrefix}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== isoPrefix) {
    return null;
  }
  return isoPrefix;
}

export function addDays(isoDate, days) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function daysBetween(startIso, endIso) {
  const start = Date.parse(`${startIso}T00:00:00.000Z`);
  const end = Date.parse(`${endIso}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export function assertForecastDate(startDate, sessionDate) {
  const offset = daysBetween(sessionDate, startDate);
  if (offset < 0) {
    throw new AppError('I can only forecast today or a future date.', {
      code: 'PAST_FORECAST_DATE',
      status: 400,
      expose: true,
    });
  }
  if (offset > 7) {
    throw new AppError(
      `Forecasts are available from ${sessionDate} through ${addDays(sessionDate, 7)}.`,
      {
        code: 'FORECAST_DATE_OUT_OF_RANGE',
        status: 400,
        expose: true,
      },
    );
  }
  return offset;
}

