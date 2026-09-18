# Feature: Branded Multi-theme Dashboard and API Hardening

## Requirements (EARS format)

- While the dashboard is open, when a visitor selects a theme, the system shall immediately apply and persist the chosen accessible color scheme.
- While the assessment is being demonstrated, the interface shall display the supplied Interact CX logo as evaluator context without presenting the project as an official company product.
- While the hero is visible, the interface shall display lightweight CSS weather graphics that do not require third-party assets or network calls.
- When a client calls a weather endpoint, the system shall validate city and date input, apply a bounded per-client rate limit, and return a request ID with any error.
- When OpenWeather repeatedly fails, the system shall open a circuit breaker and fail quickly until the cooldown expires.
- While the service is running, when an operator requests metrics, the system shall return non-sensitive process, request, provider, and cache counters.
- When the feature is complete, automated tests shall cover the rate limiter, circuit breaker, validation, and existing fulfillment behavior.

## Architecture

### Frontend

- Add the supplied logo under `public/assets/` and display it in the navigation and evaluator badge.
- Add Midnight, Aurora, Daybreak, and Storm theme tokens through `data-theme` CSS attributes.
- Persist the theme in `localStorage`, reflect selection through `aria-pressed`, and preserve reduced-motion support.
- Build animated CSS cloud layers and weather particles without third-party scripts.
- Continue encoding all API-derived values before inserting result markup.
- Keep loading, preview, live-result, and error states visually distinct.

### Backend

- Add a dependency-free fixed-window rate limiter for `/webhook` and `/api/*` endpoints.
- Add an OpenWeather circuit breaker with closed, open, and half-open states.
- Add an in-memory metrics registry and `/metrics` endpoint.
- Add versioned `/api/v1/weather/*` aliases while retaining existing endpoints.
- Return request ID and timestamp in standard API errors.
- Validate city length and control characters before external requests.

### Security

- Authentication: optional `x-webhook-secret` remains supported for Dialogflow fulfillment.
- Authorization: the API is read-only and exposes no user-owned resources.
- Input: city, date, timezone, body size, and JSON syntax are validated server-side; the client also enforces required form fields.
- Output: credentials remain server-side, logger redaction remains active, and frontend API values are HTML-encoded.
- Rate limits: direct weather endpoints use stricter limits; webhook traffic receives a higher Dialogflow-safe allowance.
- Logging: authentication failures, rate-limit events, provider circuit state, request ID, status, and latency are recorded without secrets.
- CSP: images are restricted to same-origin and data URLs; scripts and connections remain same-origin.

## Acceptance criteria

- All four themes render legibly at mobile and desktop widths.
- Interact CX branding is visible but clearly labeled as assessment context.
- Current and forecast previews remain functional without an API key.
- Rate-limited requests receive HTTP 429, `Retry-After`, and a stable error shape.
- Repeated provider failures open the circuit; a successful half-open probe closes it.
- `/metrics` exposes no API keys, secrets, raw request bodies, or personal data.
- Existing and new automated tests pass.

## Implementation plan

- [x] Define frontend, backend, and security requirements.
- [x] Copy and integrate the supplied Interact CX logo.
- [x] Add themes and decorative weather graphics.
- [x] Add rate limiting, validation, circuit breaker, and metrics.
- [x] Update API documentation and deployment documentation.
- [x] Add automated tests.
- [x] Verify mobile/desktop UI and browser console.
- [ ] Run all checks, update screenshot, commit, publish, and verify GitHub Actions.
