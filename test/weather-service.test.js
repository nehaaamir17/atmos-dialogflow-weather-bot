import test from 'node:test';
import assert from 'node:assert/strict';
import { WeatherService } from '../src/weather-service.js';

const config = {
  openWeatherApiKey: 'test-key',
  units: 'metric',
  language: 'en',
  upstreamTimeoutMs: 1000,
  geocodeCacheTtlMs: 60_000,
  weatherCacheTtlMs: 60_000,
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('encodes city and API parameters, then normalizes current results', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.hostname === 'api.openweathermap.org' && url.pathname.includes('/geo/')) {
      return response([{ name: 'São Paulo', country: 'BR', lat: -23.55, lon: -46.63 }]);
    }
    return response({
      timezone: 'America/Sao_Paulo',
      current: { dt: 1, temp: 22, weather: [{ description: 'cloudy' }] },
      daily: [],
    });
  };
  const service = new WeatherService(config, { fetchImpl });
  const result = await service.current('São Paulo, BR', 'pt');
  assert.equal(result.location.name, 'São Paulo');
  assert.equal(urls[0].searchParams.get('q'), 'São Paulo, BR');
  assert.equal(urls[1].searchParams.get('units'), 'metric');
  assert.equal(urls[1].searchParams.get('lang'), 'pt');
});

test('caches geocoding and weather responses', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (url.pathname.includes('/geo/')) return response([{ name: 'Lahore', country: 'PK', lat: 31.52, lon: 74.35 }]);
    return response({ timezone: 'Asia/Karachi', current: { dt: 1 }, daily: [] });
  };
  const service = new WeatherService(config, { fetchImpl });
  await service.current('Lahore');
  await service.current('Lahore');
  assert.equal(calls, 2);
});

test('returns a safe city-not-found error', async () => {
  const service = new WeatherService(config, { fetchImpl: async () => response([]) });
  await assert.rejects(service.current('Atlantis'), (error) => {
    assert.equal(error.code, 'CITY_NOT_FOUND');
    assert.equal(error.status, 404);
    return true;
  });
});

