import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricsRegistry } from '../src/metrics.js';

test('reports aggregate operational metrics without request data', () => {
  let now = 1_000;
  const metrics = new MetricsRegistry({ now: () => now });
  metrics.recordRequest(200, 10);
  metrics.recordRequest(503, 30);
  metrics.recordProvider(true);
  metrics.recordProvider(false);
  metrics.recordCache(true);
  metrics.recordCache(false);
  metrics.recordRateLimit();
  now = 6_000;
  const snapshot = metrics.snapshot({ weatherCircuit: { state: 'closed' } });
  assert.equal(snapshot.uptimeSeconds, 5);
  assert.equal(snapshot.requests.total, 2);
  assert.equal(snapshot.requests.errors, 1);
  assert.equal(snapshot.requests.averageDurationMs, 20);
  assert.deepEqual(snapshot.provider, { calls: 2, failures: 1 });
  assert.deepEqual(snapshot.cache, { hits: 1, misses: 1 });
  assert.equal(snapshot.rateLimits.blocked, 1);
  assert.equal(snapshot.weatherCircuit.state, 'closed');
});

