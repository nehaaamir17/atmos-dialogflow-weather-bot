# Security and reliability notes

## Trust boundaries

- Dialogflow and dashboard clients are untrusted inputs.
- OpenWeather and Open-Meteo are external dependencies with bounded request budgets.
- `OPENWEATHER_API_KEY` and `WEBHOOK_SECRET` remain server-side environment variables.
- The service is stateless and stores no end-user profiles, credentials, or conversation transcripts.

## Controls

- Optional constant-time `x-webhook-secret` verification protects `/webhook`.
- JSON bodies are limited to 64 KiB and must parse before fulfillment.
- City input is normalized, limited to 120 characters, and rejects control characters.
- Dates and IANA time zones are validated server-side.
- Weather endpoints allow 60 requests per minute per client; the Dialogflow webhook allows 120.
- Rate-limit responses include `Retry-After` and remaining-window headers.
- Provider retries are bounded, webhook fulfillment has a 4.3-second deadline, and repeated provider failures open a 30-second circuit breaker.
- The content security policy limits scripts, images, connections, form actions, and frames.
- API errors contain a request ID and timestamp without stack traces or credentials.
- Structured logging redacts authorization, webhook secret, and API-key fields.
- `/metrics` exposes aggregate counters only; it contains no city names, IP addresses, payloads, API keys, or secrets.

## Deployment guidance

- Configure a unique high-entropy `WEBHOOK_SECRET` in the host and Dialogflow fulfillment header.
- Rotate any key exposed in a screen recording or repository history.
- Keep the service behind the hosting provider's HTTPS proxy.
- Treat in-memory rate limiting as single-instance protection. For horizontal scaling, replace it with a shared Redis-backed limiter.
- Monitor provider failures and circuit state through `/metrics` and structured logs.
