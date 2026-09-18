const REDACTED_KEYS = new Set(['authorization', 'x-webhook-secret', 'appid', 'apiKey']);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(child),
    ]),
  );
}

export function log(level, event, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else console.log(line);
}

