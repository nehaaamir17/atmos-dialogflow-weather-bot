import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowRateLimiter, clientAddress } from '../src/rate-limit.js';

test('blocks requests above the configured fixed-window limit', () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter({ now: () => now });
  assert.equal(limiter.consume('api:client', { limit: 2, windowMs: 60_000 }).allowed, true);
  assert.equal(limiter.consume('api:client', { limit: 2, windowMs: 60_000 }).remaining, 0);
  const blocked = limiter.consume('api:client', { limit: 2, windowMs: 60_000 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);

  now += 60_000;
  assert.equal(limiter.consume('api:client', { limit: 2, windowMs: 60_000 }).allowed, true);
});

test('uses the first proxy address as the client key', () => {
  const request = {
    headers: { 'x-forwarded-for': '203.0.113.4, 10.0.0.2' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(clientAddress(request), '203.0.113.4');
});

