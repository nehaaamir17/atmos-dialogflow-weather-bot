import test from 'node:test';
import assert from 'node:assert/strict';
import { WeatherService } from '../src/weather-service.js';
import { CircuitBreaker } from '../src/circuit-breaker.js';

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

test('uses the Open-Meteo fallback when an OpenWeather key is unavailable', async () => {
  const urls = [];
  const fallbackConfig = { ...config, openWeatherApiKey: '', openMeteoFallback: true };
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      return response({
        results: [{
          name: 'Karachi', admin1: 'Sindh', country_code: 'PK',
          latitude: 24.86, longitude: 67.01,
        }],
      });
    }
    return response({
      timezone: 'Asia/Karachi',
      current: {
        temperature_2m: 31.4,
        apparent_temperature: 35.2,
        relative_humidity_2m: 67,
        weather_code: 2,
        wind_speed_10m: 4.1,
        visibility: 9000,
      },
      daily: {
        time: ['2026-09-18'],
        weather_code: [2],
        temperature_2m_min: [27],
        temperature_2m_max: [34],
        precipitation_probability_max: [20],
        wind_speed_10m_max: [7.2],
      },
    });
  };

  const service = new WeatherService(fallbackConfig, { fetchImpl });
  const result = await service.current('Karachi, PK');
  assert.equal(result.location.name, 'Karachi');
  assert.equal(result.location.country, 'PK');
  assert.equal(result.timezone, 'Asia/Karachi');
  assert.equal(result.current.weather[0].description, 'partly cloudy');
  assert.equal(urls[0].searchParams.get('name'), 'Karachi');
  assert.equal(urls[0].searchParams.get('countryCode'), 'PK');
  assert.equal(urls[1].hostname, 'api.open-meteo.com');
  assert.equal(urls[1].searchParams.get('forecast_days'), '8');
});

test('normalizes Open-Meteo daily arrays into the eight-day forecast contract', async () => {
  const fallbackConfig = { ...config, openWeatherApiKey: '', openMeteoFallback: true };
  const fetchImpl = async (url) => {
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      return response({
        results: [{ name: 'Karachi', country_code: 'PK', latitude: 24.86, longitude: 67.01 }],
      });
    }
    return response({
      timezone: 'Asia/Karachi',
      current: { temperature_2m: 31, weather_code: 0 },
      daily: {
        time: ['2026-09-18', '2026-09-19'],
        weather_code: [0, 61],
        temperature_2m_min: [27, 26],
        temperature_2m_max: [34, 33],
        precipitation_probability_max: [5, 70],
        wind_speed_10m_max: [6, 8],
      },
    });
  };

  const service = new WeatherService(fallbackConfig, { fetchImpl });
  const result = await service.forecast('Karachi', '2026-09-18');
  assert.equal(result.days.length, 2);
  assert.equal(result.days[0].date, '2026-09-18');
  assert.equal(result.days[1].weather[0].description, 'rain');
  assert.equal(result.days[1].pop, 0.7);
});

test('fails over when an OpenWeather key exists but One Call is not activated', async () => {
  const urls = [];
  const resilientConfig = { ...config, openMeteoFallback: true };
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.hostname === 'api.openweathermap.org' && url.pathname.includes('/geo/')) {
      return response([{ name: 'Karachi', country: 'PK', lat: 24.86, lon: 67.01 }]);
    }
    if (url.hostname === 'api.openweathermap.org') {
      return response({ cod: 401, message: 'One Call subscription required' }, 401);
    }
    return response({
      timezone: 'Asia/Karachi',
      current: { temperature_2m: 31, weather_code: 1 },
      daily: {
        time: ['2026-09-18'],
        weather_code: [1],
        temperature_2m_min: [27],
        temperature_2m_max: [34],
        precipitation_probability_max: [5],
        wind_speed_10m_max: [6],
      },
    });
  };

  const service = new WeatherService(resilientConfig, { fetchImpl });
  const result = await service.current('Karachi, PK');
  assert.equal(result.current.weather[0].description, 'mainly clear');
  assert.deepEqual(urls.map((url) => url.hostname), [
    'api.openweathermap.org',
    'api.openweathermap.org',
    'api.open-meteo.com',
  ]);
});

test('keeps fallback requests available after the OpenWeather circuit opens', async () => {
  const resilientConfig = { ...config, openMeteoFallback: true };
  const openWeatherCircuit = new CircuitBreaker({ failureThreshold: 1 });
  const fetchImpl = async (url) => {
    if (url.hostname === 'api.openweathermap.org') {
      return response({ cod: 401, message: 'Invalid key' }, 401);
    }
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      return response({
        results: [{ name: 'Karachi', country_code: 'PK', latitude: 24.86, longitude: 67.01 }],
      });
    }
    return response({
      timezone: 'Asia/Karachi',
      current: { temperature_2m: 31, weather_code: 0 },
      daily: { time: [], weather_code: [], temperature_2m_min: [], temperature_2m_max: [] },
    });
  };

  const service = new WeatherService(resilientConfig, {
    fetchImpl,
    circuitBreaker: openWeatherCircuit,
  });
  const result = await service.current('Karachi');
  assert.equal(result.location.name, 'Karachi');
  assert.equal(result.current.weather[0].description, 'clear sky');
  assert.equal(openWeatherCircuit.snapshot().state, 'open');
});
