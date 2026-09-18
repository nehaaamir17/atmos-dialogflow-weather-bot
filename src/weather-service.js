import { AppError } from './errors.js';
import { TtlCache } from './cache.js';
import { dateInTimeZone } from './time.js';
import { CircuitBreaker } from './circuit-breaker.js';

const GEO_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanLanguage(value) {
  return /^[a-z]{2}(?:-[a-z]{2})?$/i.test(value || '') ? value.toLowerCase() : 'en';
}

function openWeatherError(status, body) {
  if (status === 401 || status === 403) {
    return new AppError('The weather provider credentials are not configured correctly.', {
      code: 'WEATHER_AUTH_ERROR',
      status: 503,
      expose: true,
      details: body,
    });
  }
  if (status === 429) {
    return new AppError('The weather provider is temporarily rate limited. Please try again shortly.', {
      code: 'WEATHER_RATE_LIMITED',
      status: 503,
      expose: true,
      details: body,
    });
  }
  return new AppError('The weather provider is temporarily unavailable.', {
    code: 'WEATHER_UPSTREAM_ERROR',
    status: 502,
    expose: true,
    details: body,
  });
}

export class WeatherService {
  constructor(config, options = {}) {
    this.config = config;
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.cache = options.cache ?? new TtlCache();
    this.metrics = options.metrics;
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreaker();
  }

  assertConfigured() {
    if (!this.config.openWeatherApiKey) {
      throw new AppError('OPENWEATHER_API_KEY is not configured.', {
        code: 'WEATHER_NOT_CONFIGURED',
        status: 503,
        expose: true,
      });
    }
  }

  async fetchJson(url) {
    return this.circuitBreaker.execute(async () => {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await this.fetch(url, {
            headers: { accept: 'application/json', 'user-agent': 'dialogflow-weather-bot/1.0' },
            signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
          });
          const text = await response.text();
          let body;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = { message: 'Non-JSON response from provider' };
          }

          if (response.ok) {
            this.metrics?.recordProvider(true);
            return body;
          }
          const error = openWeatherError(response.status, body);
          if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
            lastError = error;
            await sleep(80);
            continue;
          }
          throw error;
        } catch (error) {
          if (error instanceof AppError) {
            this.metrics?.recordProvider(false);
            throw error;
          }
          lastError = new AppError('The weather provider did not respond in time.', {
            code: 'WEATHER_TIMEOUT',
            status: 504,
            expose: true,
            cause: error,
          });
          if (attempt === 0) {
            await sleep(80);
            continue;
          }
        }
      }
      this.metrics?.recordProvider(false);
      throw lastError;
    });
  }

  async geocode(city) {
    this.assertConfigured();
    const key = `geo:${city.toLocaleLowerCase('en-US')}`;
    const cached = this.cache.get(key);
    this.metrics?.recordCache(Boolean(cached));
    if (cached) return cached;

    const url = new URL(GEO_URL);
    url.searchParams.set('q', city);
    url.searchParams.set('limit', '1');
    url.searchParams.set('appid', this.config.openWeatherApiKey);

    const results = await this.fetchJson(url);
    if (!Array.isArray(results) || results.length === 0) {
      throw new AppError(`I could not find a city named “${city}”. Please include the country if needed.`, {
        code: 'CITY_NOT_FOUND',
        status: 404,
        expose: true,
      });
    }

    const match = results[0];
    return this.cache.set(
      key,
      {
        name: match.name,
        state: match.state || '',
        country: match.country || '',
        lat: match.lat,
        lon: match.lon,
      },
      this.config.geocodeCacheTtlMs,
    );
  }

  async oneCall(location, language) {
    const cacheKey = [
      'weather',
      location.lat.toFixed(4),
      location.lon.toFixed(4),
      this.config.units,
      language,
    ].join(':');
    const cached = this.cache.get(cacheKey);
    this.metrics?.recordCache(Boolean(cached));
    if (cached) return cached;

    const url = new URL(ONE_CALL_URL);
    url.searchParams.set('lat', String(location.lat));
    url.searchParams.set('lon', String(location.lon));
    url.searchParams.set('exclude', 'minutely,hourly');
    url.searchParams.set('units', this.config.units);
    url.searchParams.set('lang', cleanLanguage(language || this.config.language));
    url.searchParams.set('appid', this.config.openWeatherApiKey);

    const weather = await this.fetchJson(url);
    return this.cache.set(cacheKey, weather, this.config.weatherCacheTtlMs);
  }

  async current(city, language) {
    const location = await this.geocode(city);
    const data = await this.oneCall(location, language);
    if (!data?.current) {
      throw new AppError('Current weather data was missing from the provider response.', {
        code: 'WEATHER_DATA_MISSING',
        status: 502,
        expose: true,
      });
    }

    return {
      location,
      timezone: data.timezone || 'UTC',
      current: data.current,
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      units: this.config.units,
    };
  }

  async forecast(city, startDate, language) {
    const location = await this.geocode(city);
    const data = await this.oneCall(location, language);
    const timezone = data.timezone || 'UTC';
    const daily = Array.isArray(data.daily) ? data.daily : [];
    const matchingDays = daily
      .map((day) => ({ ...day, date: dateInTimeZone(new Date(day.dt * 1000), timezone) }))
      .filter((day) => day.date >= startDate)
      .slice(0, 8);

    if (matchingDays.length === 0) {
      throw new AppError('No forecast data is available for that date.', {
        code: 'FORECAST_DATA_UNAVAILABLE',
        status: 404,
        expose: true,
      });
    }

    return {
      location,
      timezone,
      days: matchingDays,
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      units: this.config.units,
    };
  }
}
