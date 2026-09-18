# Narrated demo script

Target length: 4–6 minutes. Record both screen and microphone audio, as required by the assessment.

## 0:00–0:30 — Introduction

> Hello, this is my Dialogflow ES Weather Info and Forecast Bot. It provides current global weather and date-aware forecasts within the next eight days. Dialogflow handles intent recognition and slot filling, my REST API handles validation and fulfillment, and OpenWeather provides geocoding and weather data.

Show the repository root and the deployed dashboard URL.

## 0:30–1:05 — Architecture and operations

> The webhook is a small Node.js service with no third-party runtime dependencies. It includes bounded upstream requests, caching, structured logs, health and readiness probes, optional webhook authentication, an OpenAPI contract, and graceful shutdown. The dashboard uses the same service layer as Dialogflow, so it is also a quick operational smoke test.

Run one current-weather request in the dashboard. Briefly show `/healthz`, `/readyz`, and `/openapi.yaml`.

## 1:05–1:40 — Dialogflow configuration

Show Dialogflow ES intents.

> The current-weather intent uses the `@sys.geo-city` system entity and requires the city parameter, so Dialogflow prompts for it when missing. The forecast intent requires both `@sys.geo-city` and `@sys.date`. Both intents call the HTTPS fulfillment webhook. Welcome, fallback, help, thanks, and goodbye intents complete the required conversational flow.

Show Fulfillment with the deployed HTTPS `/webhook` URL. Hide or blur any secret value.

## 1:40–3:05 — Required conversation

Type each message slowly and allow each response to finish:

1. `Hi`
2. `What is the current weather?`
3. `My city is Lahore`
4. `Please tell me the weather forecast from tomorrow for London`
5. `Thanks`
6. `No thanks`

Narrate:

> The first weather request demonstrates slot filling: the original utterance omits the city, Dialogflow asks for it, and the completed request reaches the webhook. The response contains current temperature, feels-like temperature, humidity, wind, visibility, sunrise, sunset, and any active alerts. The second request shows natural-language date extraction and returns daily results from the requested date through the available eight-day horizon.

## 3:05–3:40 — Date and timezone behavior

> The webhook treats “today” using the session or integration time zone when available, with a configured agent fallback. It accepts today through seven days after today, which is an inclusive eight-day window matching OpenWeather One Call 3.0. Requests in the past or beyond that horizon receive a clear corrective response.

Demonstrate one out-of-range date.

## 3:40–4:20 — Reliability and tests

Show a terminal running:

```text
npm run check
npm test
```

> Automated tests cover session timezone extraction, date normalization, the eight-day boundary, current and forecast fulfillment, URL parameter encoding, caching, and safe upstream errors. Tests mock OpenWeather, so they are deterministic and do not consume quota.

## 4:20–4:45 — Close

> The public repository includes the source, importable Dialogflow agent ZIP, deployment files, API contract, setup guide, requirements traceability, and this narrated demo script. Thank you for reviewing the project.

End on the repository README or dashboard with the public URL visible.

