import { AppError } from './errors.js';
import { TtlCache } from './cache.js';
import { dateInTimeZone } from './time.js';
import { CircuitBreaker } from './circuit-breaker.js';

const GEO_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const CURRENT_URL = 'https://api.openweathermap.org/data/2.5/weather';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';
const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanLanguage(value) {
  return /^[a-z]{2}(?:-[a-z]{2})?$/i.test(value || '') ? value.toLowerCase() : 'en';
}

function providerError(status, body, provider) {
  if (provider === 'openweather' && (status === 401 || status === 403)) {
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

function fallbackEnabled(config) {
  return config.openMeteoFallback !== false;
}

function weatherDescription(code) {
  if (code === 0) return 'clear sky';
  if (code === 1) return 'mainly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55].includes(code)) return 'drizzle';
  if ([56, 57].includes(code)) return 'freezing drizzle';
  if ([61, 63, 65].includes(code)) return 'rain';
  if ([66, 67].includes(code)) return 'freezing rain';
  if ([71, 73, 75, 77].includes(code)) return 'snow';
  if ([80, 81, 82].includes(code)) return 'rain showers';
  if ([85, 86].includes(code)) return 'snow showers';
  if (code === 95) return 'thunderstorm';
  if (code === 96 || code === 99) return 'thunderstorm with hail';
  return 'conditions unavailable';
}

function at(values, index) {
  return Array.isArray(values) ? values[index] : undefined;
}

function toConfiguredTemperature(value, units) {
  if (!Number.isFinite(value)) return value;
  return units === 'standard' ? value + 273.15 : value;
}

function fixedOffsetTimeZone(offsetSeconds = 0) {
  const totalMinutes = Math.round(offsetSeconds / 60);
  const sign = totalMinutes < 0 ? '-' : '+';
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function parseCityQuery(city) {
  const [name, ...qualifiers] = city.split(',').map((part) => part.trim()).filter(Boolean);
  return { name, qualifiers };
}

function sameText(left, right) {
  return String(left || '').localeCompare(String(right || ''), undefined, {
    sensitivity: 'accent',
  }) === 0;
}

function countryName(countryCode) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode);
  } catch {
    return '';
  }
}

function locationMatchesQualifiers(location, qualifiers) {
  if (!qualifiers.length) return true;
  const countryCode = String(location.country_code || location.country || '').toUpperCase();
  const fields = [
    location.country_code,
    location.country,
    countryName(countryCode),
    location.state,
    location.admin1,
    location.admin2,
  ].filter(Boolean);
  return qualifiers.every((qualifier) => {
    const normalized = qualifier.toUpperCase() === 'UK' ? 'GB' : qualifier;
    return fields.some((field) => sameText(field, normalized));
  });
}

function isRecognizedCity(result) {
  const featureCode = String(result.feature_code || '').toUpperCase();
  if (!featureCode) return true;
  if (/^PPL[AC]/.test(featureCode)) return true;
  return Number.isFinite(result.population) && result.population >= 1_000;
}

export class WeatherService {
  constructor(config, options = {}) {
    this.config = config;
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.cache = options.cache ?? new TtlCache();
    this.metrics = options.metrics;
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreaker();
    this.fallbackCircuitBreaker = options.fallbackCircuitBreaker ?? new CircuitBreaker();
  }

  assertConfigured() {
    if (!this.config.openWeatherApiKey && !fallbackEnabled(this.config)) {
      throw new AppError('No weather provider is configured.', {
        code: 'WEATHER_NOT_CONFIGURED',
        status: 503,
        expose: true,
      });
    }
  }

  async fetchJson(url, provider = 'openweather') {
    const circuitBreaker = provider === 'open-meteo'
      ? this.fallbackCircuitBreaker
      : this.circuitBreaker;
    return circuitBreaker.execute(async () => {
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
          const error = providerError(response.status, body, provider);
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
    const useOpenWeatherGeocoding = Boolean(
      this.config.openWeatherApiKey && this.config.openWeatherOneCallEnabled,
    );
    const primaryProvider = fallbackEnabled(this.config) && !useOpenWeatherGeocoding
      ? 'open-meteo'
      : 'openweather';
    try {
      return await this.geocodeWithProvider(city, primaryProvider);
    } catch (error) {
      if (error?.code === 'CITY_NOT_FOUND') throw error;
      if (primaryProvider === 'open-meteo' && this.config.openWeatherApiKey) {
        return this.geocodeWithProvider(city, 'openweather');
      }
      if (primaryProvider === 'openweather' && fallbackEnabled(this.config)) {
        return this.geocodeWithProvider(city, 'open-meteo');
      }
      throw error;
    }
  }

  async geocodeWithProvider(city, provider) {
    const key = `geo:${provider}:${city.toLocaleLowerCase('en-US')}`;
    const cached = this.cache.get(key);
    this.metrics?.recordCache(Boolean(cached));
    if (cached) return cached;

    const { name, qualifiers } = parseCityQuery(city);
    let match;
    if (provider === 'openweather') {
      const url = new URL(GEO_URL);
      url.searchParams.set('q', city);
      url.searchParams.set('limit', qualifiers.length ? '5' : '1');
      url.searchParams.set('appid', this.config.openWeatherApiKey);
      const results = await this.fetchJson(url, provider);
      match = Array.isArray(results)
        ? results.find((result) => locationMatchesQualifiers(result, qualifiers))
        : undefined;
    } else {
      const url = new URL(OPEN_METEO_GEO_URL);
      url.searchParams.set('name', name);
      url.searchParams.set('count', qualifiers.length ? '20' : '10');
      url.searchParams.set('language', cleanLanguage(this.config.language));
      const countryQualifier = qualifiers.at(-1);
      if (/^[a-z]{2}$/i.test(countryQualifier || '')) {
        const countryCode = countryQualifier.toUpperCase() === 'UK'
          ? 'GB'
          : countryQualifier.toUpperCase();
        url.searchParams.set('countryCode', countryCode);
      }
      const payload = await this.fetchJson(url, provider);
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const result = results.find((item) => (
        locationMatchesQualifiers(item, qualifiers) && isRecognizedCity(item)
      ));
      if (result) {
        match = {
          name: result.name,
          state: result.admin1 || '',
          country: result.country_code || result.country || '',
          lat: result.latitude,
          lon: result.longitude,
        };
      }
    }

    if (!match) {
      throw new AppError(`I could not verify “${city}” as a city. Check the spelling or use City, Country Code (for example, Karachi, PK).`, {
        code: 'CITY_NOT_FOUND',
        status: 404,
        expose: true,
      });
    }

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
    this.assertConfigured();
    const useOpenWeather = Boolean(
      this.config.openWeatherApiKey && this.config.openWeatherOneCallEnabled,
    );
    if (!useOpenWeather && !fallbackEnabled(this.config)) {
      throw new AppError('The eight-day forecast provider is not configured.', {
        code: 'WEATHER_NOT_CONFIGURED',
        status: 503,
        expose: true,
      });
    }
    const primaryProvider = useOpenWeather ? 'openweather' : 'open-meteo';
    try {
      return await this.oneCallWithProvider(location, language, primaryProvider);
    } catch (error) {
      if (primaryProvider !== 'openweather' || !fallbackEnabled(this.config)) throw error;
      return this.oneCallWithProvider(location, language, 'open-meteo');
    }
  }

  async oneCallWithProvider(location, language, provider) {
    const cacheKey = [
      'weather',
      provider,
      location.lat.toFixed(4),
      location.lon.toFixed(4),
      this.config.units,
      language,
    ].join(':');
    const cached = this.cache.get(cacheKey);
    this.metrics?.recordCache(Boolean(cached));
    if (cached) return cached;

    let weather;
    if (provider === 'openweather') {
      const url = new URL(ONE_CALL_URL);
      url.searchParams.set('lat', String(location.lat));
      url.searchParams.set('lon', String(location.lon));
      url.searchParams.set('exclude', 'minutely,hourly');
      url.searchParams.set('units', this.config.units);
      url.searchParams.set('lang', cleanLanguage(language || this.config.language));
      url.searchParams.set('appid', this.config.openWeatherApiKey);
      weather = await this.fetchJson(url, provider);
    } else {
      const url = new URL(OPEN_METEO_FORECAST_URL);
      url.searchParams.set('latitude', String(location.lat));
      url.searchParams.set('longitude', String(location.lon));
      url.searchParams.set('current', [
        'temperature_2m',
        'apparent_temperature',
        'relative_humidity_2m',
        'weather_code',
        'wind_speed_10m',
        'visibility',
      ].join(','));
      url.searchParams.set('daily', [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'relative_humidity_2m_mean',
        'precipitation_probability_max',
        'wind_speed_10m_max',
      ].join(','));
      url.searchParams.set('timezone', 'auto');
      url.searchParams.set('forecast_days', '8');
      url.searchParams.set('temperature_unit', this.config.units === 'imperial' ? 'fahrenheit' : 'celsius');
      url.searchParams.set('wind_speed_unit', this.config.units === 'imperial' ? 'mph' : 'ms');
      const payload = await this.fetchJson(url, provider);
      const current = payload?.current || {};
      const daily = payload?.daily || {};
      const dates = Array.isArray(daily.time) ? daily.time : [];
      weather = {
        timezone: payload?.timezone || 'UTC',
        provider,
        current: {
          dt: Math.floor(Date.now() / 1000),
          temp: toConfiguredTemperature(current.temperature_2m, this.config.units),
          feels_like: toConfiguredTemperature(current.apparent_temperature, this.config.units),
          humidity: current.relative_humidity_2m,
          wind_speed: current.wind_speed_10m,
          visibility: current.visibility,
          weather: [{ description: weatherDescription(current.weather_code) }],
        },
        daily: dates.map((date, index) => ({
          date,
          dt: Math.floor(Date.parse(`${date}T12:00:00.000Z`) / 1000),
          temp: {
            min: toConfiguredTemperature(at(daily.temperature_2m_min, index), this.config.units),
            max: toConfiguredTemperature(at(daily.temperature_2m_max, index), this.config.units),
          },
          pop: Number.isFinite(at(daily.precipitation_probability_max, index))
            ? at(daily.precipitation_probability_max, index) / 100
            : 0,
          humidity: at(daily.relative_humidity_2m_mean, index),
          wind_speed: at(daily.wind_speed_10m_max, index),
          weather: [{ description: weatherDescription(at(daily.weather_code, index)) }],
        })),
        alerts: [],
      };
    }
    return this.cache.set(cacheKey, weather, this.config.weatherCacheTtlMs);
  }

  async openWeatherCurrent(location, language) {
    const cacheKey = [
      'current',
      'openweather',
      location.lat.toFixed(4),
      location.lon.toFixed(4),
      this.config.units,
      language,
    ].join(':');
    const cached = this.cache.get(cacheKey);
    this.metrics?.recordCache(Boolean(cached));
    if (cached) return cached;

    const url = new URL(CURRENT_URL);
    url.searchParams.set('lat', String(location.lat));
    url.searchParams.set('lon', String(location.lon));
    url.searchParams.set('units', this.config.units);
    url.searchParams.set('lang', cleanLanguage(language || this.config.language));
    url.searchParams.set('appid', this.config.openWeatherApiKey);
    const payload = await this.fetchJson(url, 'openweather');
    const current = {
      dt: payload?.dt,
      temp: payload?.main?.temp,
      feels_like: payload?.main?.feels_like,
      humidity: payload?.main?.humidity,
      wind_speed: payload?.wind?.speed,
      visibility: payload?.visibility,
      sunrise: payload?.sys?.sunrise,
      sunset: payload?.sys?.sunset,
      weather: Array.isArray(payload?.weather) ? payload.weather : [],
    };
    const weather = {
      timezone: fixedOffsetTimeZone(payload?.timezone),
      current,
      daily: [],
      alerts: [],
      provider: 'openweather-current',
    };
    return this.cache.set(cacheKey, weather, this.config.weatherCacheTtlMs);
  }

  async current(city, language) {
    const location = await this.geocode(city);
    let data;
    if (this.config.openWeatherApiKey && !this.config.openWeatherOneCallEnabled) {
      try {
        data = await this.openWeatherCurrent(location, language);
      } catch (error) {
        if (!fallbackEnabled(this.config)) throw error;
        data = await this.oneCallWithProvider(location, language, 'open-meteo');
      }
    } else {
      data = await this.oneCall(location, language);
    }
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
      .map((day) => ({
        ...day,
        date: day.date || dateInTimeZone(new Date(day.dt * 1000), timezone),
      }))
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
