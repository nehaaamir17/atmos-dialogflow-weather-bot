import { AppError } from './errors.js';
import {
  assertForecastDate,
  extractSessionTimeZone,
  normalizeDialogflowDate,
  todayInTimeZone,
} from './time.js';
import { formatCurrentWeather, formatForecast } from './format.js';
import { validateCity } from './validation.js';

export function normalizeCity(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    return String(value.city ?? value.name ?? value['geo-city'] ?? '').trim();
  }
  return '';
}

function contextParameter(request, names) {
  const contexts = request?.queryResult?.outputContexts ?? [];
  for (const context of contexts) {
    for (const name of names) {
      const value = context?.parameters?.[name];
      if (value != null && value !== '') return value;
    }
  }
  return undefined;
}

function intentDetails(request) {
  const queryResult = request.queryResult;
  const parameters = queryResult.parameters ?? {};
  const action = queryResult.action || '';
  const displayName = queryResult.intent?.displayName || '';
  const city = normalizeCity(
    parameters.city ??
    parameters['geo-city'] ??
    parameters.location ??
    contextParameter(request, ['city', 'city.original']),
  );
  const rawDate = parameters.date ?? parameters['date-period'] ?? parameters.startDate;

  return {
    action,
    displayName,
    city,
    date: normalizeDialogflowDate(rawDate),
    language: queryResult.languageCode || 'en',
    isForecast: action === 'weather.forecast' || /forecast/i.test(displayName),
  };
}

function textResponse(text, request, city) {
  const response = {
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }],
    source: 'dialogflow-es-weather-webhook',
  };

  if (city && request.session) {
    response.outputContexts = [{
      name: `${request.session}/contexts/weather-session`,
      lifespanCount: 5,
      parameters: { city },
    }];
  }
  return response;
}

export async function fulfillDialogflow(request, dependencies) {
  if (!request || typeof request !== 'object' || !request.queryResult) {
    throw new AppError('A valid Dialogflow ES WebhookRequest is required.', {
      code: 'INVALID_WEBHOOK_REQUEST',
      status: 400,
      expose: true,
    });
  }

  const details = intentDetails(request);
  if (!details.city) {
    return textResponse('Please provide your city, including the country if the name is ambiguous.', request);
  }
  details.city = validateCity(details.city);

  const timeZone = extractSessionTimeZone(request, dependencies.config.defaultTimeZone);
  const sessionDate = todayInTimeZone(timeZone, dependencies.now?.() ?? new Date());

  if (details.isForecast) {
    if (!details.date) {
      return textResponse(
        `Please provide a forecast date between ${sessionDate} and the next 7 days.`,
        request,
        details.city,
      );
    }
    assertForecastDate(details.date, sessionDate);
    const forecast = await dependencies.weatherService.forecast(
      details.city,
      details.date,
      details.language,
    );
    return textResponse(formatForecast(forecast), request, details.city);
  }

  const current = await dependencies.weatherService.current(details.city, details.language);
  return textResponse(formatCurrentWeather(current), request, details.city);
}
