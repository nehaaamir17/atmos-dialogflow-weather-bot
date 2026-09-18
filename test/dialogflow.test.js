import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfillDialogflow, normalizeCity } from '../src/dialogflow.js';

const config = { defaultTimeZone: 'UTC' };
const now = () => new Date('2026-09-18T10:00:00.000Z');

function webhookRequest(action, parameters) {
  return {
    session: 'projects/demo/agent/sessions/test-session',
    queryResult: {
      action,
      parameters,
      languageCode: 'en',
      intent: { displayName: action === 'weather.forecast' ? 'Weather - Forecast' : 'Weather - Current' },
    },
    originalDetectIntentRequest: { payload: { timeZone: 'UTC' } },
  };
}

test('normalizes city parameter variants', () => {
  assert.equal(normalizeCity(' Lahore '), 'Lahore');
  assert.equal(normalizeCity({ city: 'Karachi' }), 'Karachi');
});

test('asks for city when Dialogflow calls webhook without the required slot', async () => {
  const response = await fulfillDialogflow(webhookRequest('weather.current', {}), {
    config,
    weatherService: {},
    now,
  });
  assert.match(response.fulfillmentText, /provide your city/i);
});

test('fulfills current weather and preserves city in a session context', async () => {
  const weatherService = {
    current: async () => ({
      location: { name: 'Lahore', country: 'PK' },
      timezone: 'Asia/Karachi',
      units: 'metric',
      alerts: [],
      current: {
        dt: 1_758_180_000,
        temp: 31.4,
        feels_like: 34,
        humidity: 61,
        wind_speed: 4.2,
        visibility: 9000,
        sunrise: 1_758_164_400,
        sunset: 1_758_207_600,
        weather: [{ description: 'clear sky' }],
      },
    }),
  };
  const response = await fulfillDialogflow(webhookRequest('weather.current', { city: 'Lahore' }), {
    config, weatherService, now,
  });
  assert.match(response.fulfillmentText, /Current weather for Lahore, PK/);
  assert.equal(response.outputContexts[0].parameters.city, 'Lahore');
});

test('fulfills a forecast starting on the requested date', async () => {
  let receivedStartDate;
  const weatherService = {
    forecast: async (_city, startDate) => {
      receivedStartDate = startDate;
      return {
        location: { name: 'London', country: 'GB' },
        timezone: 'Europe/London',
        units: 'metric',
        alerts: [],
        days: [{
          date: '2026-09-20', temp: { min: 12, max: 19 }, pop: 0.2,
          humidity: 70, wind_speed: 3, weather: [{ description: 'light rain' }],
        }],
      };
    },
  };
  const request = webhookRequest('weather.forecast', { city: 'London', date: '2026-09-20' });
  const response = await fulfillDialogflow(request, { config, weatherService, now });
  assert.equal(receivedStartDate, '2026-09-20');
  assert.match(response.fulfillmentText, /Forecast for London, GB/);
  assert.match(response.fulfillmentText, /light rain/);
});

test('rejects forecast dates outside the next eight calendar days', async () => {
  const request = webhookRequest('weather.forecast', { city: 'London', date: '2026-09-26' });
  await assert.rejects(
    fulfillDialogflow(request, { config, weatherService: {}, now }),
    /through 2026-09-25/,
  );
});

