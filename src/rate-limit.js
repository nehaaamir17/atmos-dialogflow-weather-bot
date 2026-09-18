export class FixedWindowRateLimiter {
  constructor({ now = () => Date.now(), maxEntries = 10_000 } = {}) {
    this.now = now;
    this.maxEntries = maxEntries;
    this.windows = new Map();
  }

  consume(key, { limit, windowMs }) {
    const timestamp = this.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= timestamp) {
      entry = { count: 0, resetAt: timestamp + windowMs };
      this.windows.set(key, entry);
    }
    entry.count += 1;

    if (this.windows.size > this.maxEntries) this.sweep(timestamp);
    const remaining = Math.max(0, limit - entry.count);
    return {
      allowed: entry.count <= limit,
      limit,
      remaining,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000)),
    };
  }

  sweep(timestamp = this.now()) {
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= timestamp) this.windows.delete(key);
    }
    while (this.windows.size > this.maxEntries) {
      this.windows.delete(this.windows.keys().next().value);
    }
  }
}

export function clientAddress(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(request.headers['x-real-ip'] || request.socket?.remoteAddress || 'unknown');
}

