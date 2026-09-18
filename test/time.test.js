import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  assertForecastDate,
  extractSessionTimeZone,
  normalizeDialogflowDate,
  todayInTimeZone,
} from '../src/time.js';

test('uses the integration time zone from session payload', () => {
  const request = { originalDetectIntentRequest: { payload: { timeZone: 'Asia/Karachi' } } };
  assert.equal(extractSessionTimeZone(request, 'UTC'), 'Asia/Karachi');
});

test('falls back safely when the payload time zone is invalid', () => {
  const request = { originalDetectIntentRequest: { payload: { timeZone: 'Mars/Olympus' } } };
  assert.equal(extractSessionTimeZone(request, 'UTC'), 'UTC');
});

test('derives the session date in its time zone', () => {
  const instant = new Date('2026-01-01T01:00:00.000Z');
  assert.equal(todayInTimeZone('America/Los_Angeles', instant), '2025-12-31');
  assert.equal(todayInTimeZone('Asia/Karachi', instant), '2026-01-01');
});

test('normalizes Dialogflow date strings and date-period objects', () => {
  assert.equal(normalizeDialogflowDate('2026-09-21T12:00:00+05:00'), '2026-09-21');
  assert.equal(normalizeDialogflowDate({ startDate: '2026-09-22' }), '2026-09-22');
  assert.equal(normalizeDialogflowDate('not-a-date'), null);
});

test('enforces the inclusive eight-day forecast horizon', () => {
  assert.equal(assertForecastDate('2026-09-18', '2026-09-18'), 0);
  assert.equal(assertForecastDate('2026-09-25', '2026-09-18'), 7);
  assert.throws(() => assertForecastDate('2026-09-26', '2026-09-18'), /through 2026-09-25/);
  assert.throws(() => assertForecastDate('2026-09-17', '2026-09-18'), /future date/);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

