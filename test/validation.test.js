import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCity } from '../src/validation.js';

test('accepts global city names and normalizes surrounding whitespace', () => {
  assert.equal(validateCity('  São Paulo, BR  '), 'São Paulo, BR');
  assert.equal(validateCity('اسلام آباد'), 'اسلام آباد');
});

test('rejects missing, oversized, and control-character city input', () => {
  assert.throws(() => validateCity(''), (error) => error.code === 'CITY_REQUIRED');
  assert.throws(() => validateCity('x'.repeat(121)), (error) => error.code === 'CITY_TOO_LONG');
  assert.throws(() => validateCity('London\nInjected'), (error) => error.code === 'INVALID_CITY');
});

