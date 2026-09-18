import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isValidTimeZone } from './config.js';
import { fulfillDialogflow } from './dialogflow.js';
import { AppError, toPublicError } from './errors.js';
import { log } from './logger.js';
import { assertForecastDate, normalizeDialogflowDate, todayInTimeZone } from './time.js';
import { serializeCurrent, serializeForecast } from './format.js';
import { FixedWindowRateLimiter, clientAddress } from './rate-limit.js';
import { validateCity } from './validation.js';

const DASHBOARD = readFileSync(new URL('../public/index.html', import.meta.url));
const OPENAPI = readFileSync(new URL('../openapi.yaml', import.meta.url));
const INTERACT_CX_LOGO = readFileSync(new URL('../public/assets/interactcx-logo.png', import.meta.url));
const MAX_BODY_BYTES = 64 * 1024;
const DIALOGFLOW_DEADLINE_MS = 4300;
const DEFAULT_RATE_LIMITER = new FixedWindowRateLimiter();

function secureEqual(left, right) {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function setSecurityHeaders(response, requestId) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  response.setHeader('x-request-id', requestId);
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function sendFile(response, contentType, body, cacheControl = 'no-cache') {
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': body.length,
    'cache-control': cacheControl,
  });
  response.end(body);
}

function apiErrorBody(publicError, requestId) {
  return {
    error: {
      code: publicError.code,
      message: publicError.message,
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

function enforceRateLimit(request, response, rateLimiter, metrics, bucket, options) {
  const result = rateLimiter.consume(`${bucket}:${clientAddress(request)}`, options);
  response.setHeader('x-ratelimit-limit', String(result.limit));
  response.setHeader('x-ratelimit-remaining', String(result.remaining));
  response.setHeader('x-ratelimit-reset', String(Math.ceil(result.resetAt / 1000)));
  if (result.allowed) return;
  response.setHeader('retry-after', String(result.retryAfterSeconds));
  metrics?.recordRateLimit();
  throw new AppError('Too many requests. Please try again shortly.', {
    code: 'RATE_LIMITED', status: 429, expose: true,
  });
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new AppError('Request body exceeds 64 KiB.', {
        code: 'REQUEST_TOO_LARGE', status: 413, expose: true,
      });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new AppError('Request body must be valid JSON.', {
      code: 'INVALID_JSON', status: 400, expose: true, cause: error,
    });
  }
}

function requireWebhookAuthentication(request, config) {
  if (!config.webhookSecret) return;
  const supplied = String(request.headers['x-webhook-secret'] || '');
  if (!supplied || !secureEqual(supplied, config.webhookSecret)) {
    throw new AppError('Webhook authentication failed.', {
      code: 'UNAUTHORIZED', status: 401, expose: true,
    });
  }
}

async function withinDeadline(promise, milliseconds) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new AppError(
          'The weather provider is taking too long. Please try again in a moment.',
          { code: 'WEBHOOK_DEADLINE_EXCEEDED', status: 504, expose: true },
        )), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function createApp({
  config,
  weatherService,
  metrics,
  circuitBreaker,
  rateLimiter = DEFAULT_RATE_LIMITER,
  now = () => new Date(),
}) {
  return async function handler(request, response) {
    const requestId = String(request.headers['x-request-id'] || randomUUID());
    const startedAt = performance.now();
    setSecurityHeaders(response, requestId);

    let path = request.url?.split('?')[0] || '/';
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      path = url.pathname;

      if (request.method === 'GET' && url.pathname === '/') {
        sendFile(response, 'text/html; charset=utf-8', DASHBOARD);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/openapi.yaml') {
        sendFile(response, 'application/yaml; charset=utf-8', OPENAPI);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/assets/interactcx-logo.png') {
        sendFile(response, 'image/png', INTERACT_CX_LOGO, 'public, max-age=86400');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/healthz') {
        sendJson(response, 200, { status: 'ok', service: 'dialogflow-weather-webhook' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        const ready = Boolean(config.openWeatherApiKey);
        sendJson(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'not_ready',
          checks: { openWeatherApiKey: ready },
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/metrics') {
        sendJson(response, 200, metrics?.snapshot({
          weatherCircuit: circuitBreaker?.snapshot() ?? { state: 'unknown' },
        }) ?? { status: 'metrics_not_configured' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/webhook') {
        enforceRateLimit(request, response, rateLimiter, metrics, 'webhook', {
          limit: 120, windowMs: 60_000,
        });
        requireWebhookAuthentication(request, config);
        const body = await readJson(request);
        try {
          const result = await withinDeadline(
            fulfillDialogflow(body, { config, weatherService, now }),
            DIALOGFLOW_DEADLINE_MS,
          );
          sendJson(response, 200, result);
        } catch (error) {
          const publicError = toPublicError(error);
          log('error', 'webhook_fulfillment_failed', {
            requestId,
            code: publicError.code,
            error: error.message,
            intent: body?.queryResult?.intent?.displayName,
          });
          sendJson(response, 200, {
            fulfillmentText: publicError.message,
            fulfillmentMessages: [{ text: { text: [publicError.message] } }],
            source: 'dialogflow-es-weather-webhook',
          });
        }
        return;
      }
      const currentPaths = new Set(['/api/weather/current', '/api/v1/weather/current']);
      if (request.method === 'GET' && currentPaths.has(url.pathname)) {
        enforceRateLimit(request, response, rateLimiter, metrics, 'weather-api', {
          limit: 60, windowMs: 60_000,
        });
        const city = validateCity(url.searchParams.get('city') || '');
        const result = await weatherService.current(city, config.language);
        sendJson(response, 200, serializeCurrent(result));
        return;
      }
      const forecastPaths = new Set(['/api/weather/forecast', '/api/v1/weather/forecast']);
      if (request.method === 'GET' && forecastPaths.has(url.pathname)) {
        enforceRateLimit(request, response, rateLimiter, metrics, 'weather-api', {
          limit: 60, windowMs: 60_000,
        });
        const city = validateCity(url.searchParams.get('city') || '');
        const timeZone = url.searchParams.get('timeZone') || config.defaultTimeZone;
        if (!isValidTimeZone(timeZone)) throw new AppError('timeZone must be a valid IANA time zone.', {
          code: 'INVALID_TIME_ZONE', status: 400, expose: true,
        });
        const today = todayInTimeZone(timeZone, now());
        const startDate = normalizeDialogflowDate(url.searchParams.get('date')) || today;
        assertForecastDate(startDate, today);
        const result = await weatherService.forecast(city, startDate, config.language);
        sendJson(response, 200, serializeForecast(result));
        return;
      }

      sendJson(response, 404, apiErrorBody({ code: 'NOT_FOUND', message: 'Route not found.' }, requestId));
    } catch (error) {
      const publicError = toPublicError(error);
      log(publicError.status >= 500 ? 'error' : 'warn', 'http_request_failed', {
        requestId,
        code: publicError.code,
        error: error.message,
      });
      sendJson(response, publicError.status, apiErrorBody(publicError, requestId));
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      metrics?.recordRequest(response.statusCode, durationMs);
      log('info', 'http_request_completed', {
        requestId,
        method: request.method,
        path,
        status: response.statusCode,
        durationMs,
      });
    }
  };
}
