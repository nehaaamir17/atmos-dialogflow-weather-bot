import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../src/circuit-breaker.js';

test('opens after repeated failures and rejects without calling the provider', async () => {
  let calls = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000, now: () => 0 });
  const fail = () => breaker.execute(async () => { calls += 1; throw new Error('provider down'); });
  await assert.rejects(fail(), /provider down/);
  await assert.rejects(fail(), /provider down/);
  await assert.rejects(fail(), (error) => error.code === 'WEATHER_CIRCUIT_OPEN');
  assert.equal(calls, 2);
  assert.equal(breaker.snapshot().state, 'open');
});

test('closes after a successful half-open recovery probe', async () => {
  let now = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: () => now });
  await assert.rejects(breaker.execute(async () => { throw new Error('down'); }));
  now = 1_001;
  assert.equal(await breaker.execute(async () => 'recovered'), 'recovered');
  assert.deepEqual(breaker.snapshot(), {
    state: 'closed', consecutiveFailures: 0, retryAt: null,
  });
});

