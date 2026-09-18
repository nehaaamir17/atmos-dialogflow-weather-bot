import { dateInTimeZone } from './time.js';

const UNIT_LABELS = {
  standard: { temperature: 'K', wind: 'm/s' },
  metric: { temperature: '°C', wind: 'm/s' },
  imperial: { temperature: '°F', wind: 'mph' },
};

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value) : 'unknown';
}

export function locationLabel(location) {
  return [location.name, location.state, location.country].filter(Boolean).join(', ');
}

function condition(entry) {
  return entry?.weather?.[0]?.description || 'conditions unavailable';
}

function localTime(unixSeconds, timeZone) {
  if (!Number.isFinite(unixSeconds)) return 'unknown';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}

function friendlyDate(isoDate, timeZone = 'UTC') {
  const instant = new Date(`${isoDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(instant);
}

function alertSentence(alerts) {
  if (!alerts?.length) return '';
  const names = [...new Set(alerts.slice(0, 2).map((alert) => alert.event).filter(Boolean))];
  return names.length ? ` Active alert${names.length > 1 ? 's' : ''}: ${names.join('; ')}.` : '';
}

export function formatCurrentWeather(result) {
  const labels = UNIT_LABELS[result.units] || UNIT_LABELS.metric;
  const current = result.current;
  const observedDate = dateInTimeZone(new Date(current.dt * 1000), result.timezone);

  return [
    `Current weather for ${locationLabel(result.location)} (${observedDate}, ${localTime(current.dt, result.timezone)} local time):`,
    `${condition(current)}, ${rounded(current.temp)}${labels.temperature} (feels like ${rounded(current.feels_like)}${labels.temperature}).`,
    `Humidity ${rounded(current.humidity)}%, wind ${rounded(current.wind_speed)} ${labels.wind}, visibility ${rounded((current.visibility || 0) / 1000)} km.`,
    `Sunrise ${localTime(current.sunrise, result.timezone)}; sunset ${localTime(current.sunset, result.timezone)}.${alertSentence(result.alerts)}`,
  ].join('\n');
}

export function formatForecast(result) {
  const labels = UNIT_LABELS[result.units] || UNIT_LABELS.metric;
  const rows = result.days.map((day) => {
    const probability = Math.round((day.pop || 0) * 100);
    return `• ${friendlyDate(day.date, result.timezone)}: ${condition(day)}; ${rounded(day.temp?.min)}–${rounded(day.temp?.max)}${labels.temperature}; rain ${probability}%; humidity ${rounded(day.humidity)}%; wind ${rounded(day.wind_speed)} ${labels.wind}.`;
  });
  const endDate = result.days.at(-1).date;
  return [
    `Forecast for ${locationLabel(result.location)} from ${result.days[0].date} to ${endDate}:`,
    ...rows,
    alertSentence(result.alerts).trim(),
  ].filter(Boolean).join('\n');
}

export function serializeCurrent(result) {
  return {
    location: result.location,
    timezone: result.timezone,
    units: result.units,
    observedAt: new Date(result.current.dt * 1000).toISOString(),
    condition: condition(result.current),
    temperature: result.current.temp,
    feelsLike: result.current.feels_like,
    humidity: result.current.humidity,
    windSpeed: result.current.wind_speed,
    visibilityMeters: result.current.visibility,
    alerts: result.alerts.map((alert) => alert.event).filter(Boolean),
  };
}

export function serializeForecast(result) {
  return {
    location: result.location,
    timezone: result.timezone,
    units: result.units,
    days: result.days.map((day) => ({
      date: day.date,
      condition: condition(day),
      minimumTemperature: day.temp?.min,
      maximumTemperature: day.temp?.max,
      precipitationProbability: day.pop,
      humidity: day.humidity,
      windSpeed: day.wind_speed,
    })),
    alerts: result.alerts.map((alert) => alert.event).filter(Boolean),
  };
}

