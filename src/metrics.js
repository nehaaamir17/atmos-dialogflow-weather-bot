export class MetricsRegistry {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.startedAt = now();
    this.requests = { total: 0, errors: 0, byStatus: {}, totalDurationMs: 0 };
    this.provider = { calls: 0, failures: 0 };
    this.cache = { hits: 0, misses: 0 };
    this.rateLimits = { blocked: 0 };
  }

  recordRequest(status, durationMs) {
    this.requests.total += 1;
    this.requests.totalDurationMs += durationMs;
    this.requests.byStatus[status] = (this.requests.byStatus[status] || 0) + 1;
    if (status >= 400) this.requests.errors += 1;
  }

  recordProvider(success) {
    this.provider.calls += 1;
    if (!success) this.provider.failures += 1;
  }

  recordCache(hit) {
    this.cache[hit ? 'hits' : 'misses'] += 1;
  }

  recordRateLimit() {
    this.rateLimits.blocked += 1;
  }

  snapshot(extra = {}) {
    const memory = process.memoryUsage();
    return {
      service: 'dialogflow-weather-webhook',
      uptimeSeconds: Math.floor((this.now() - this.startedAt) / 1000),
      requests: {
        ...this.requests,
        averageDurationMs: this.requests.total
          ? Math.round(this.requests.totalDurationMs / this.requests.total)
          : 0,
      },
      provider: { ...this.provider },
      cache: { ...this.cache },
      rateLimits: { ...this.rateLimits },
      process: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        nodeVersion: process.version,
      },
      ...extra,
    };
  }
}

