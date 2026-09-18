# Assessment traceability

This matrix maps every requirement in the supplied three-page assessment to a concrete implementation or submission action.

| Assessment requirement | Implementation / evidence |
|---|---|
| Build a chatbot using Google Dialogflow ES | Importable agent source in `dialogflow-agent/` and ZIP in `dist/` |
| Current global weather for a specific city | `Weather - Current` intent → `POST /webhook` → OpenWeather geocoding + free Current Weather data |
| Forecast global weather for up to the next 8 days | `Weather - Forecast` intent and inclusive today…today+7 validation in `src/time.js` |
| Follow the supplied conversational sequence | Welcome, current slot filling, forecast, thanks, and goodbye intents mirror the diagram |
| Configure a fulfillment webhook | Weather intents have `webhookUsed: true`; final URL instructions are in `docs/SETUP.md` |
| Backend language/framework of choice | Node.js 20+ REST service using the standard HTTP and Fetch APIs |
| Receive Dialogflow WebhookRequest | `POST /webhook`, 64 KiB body bound, JSON validation, action/intent dispatch |
| Fetch city and date parameters | `src/dialogflow.js` accepts common city/date parameter shapes and context fallback |
| Fetch time automatically from chat session details | `extractSessionTimeZone()` reads integration/session payload variants, then uses the agent default |
| No date means current weather is relevant to session date | Current intent does not require date and formats the provider observation in the city's local time |
| Calculate eight-day forecast from start date | Start date is validated against the session date and daily data is filtered from that date to the eight-day horizon |
| Use the linked API resource | OpenWeather Geocoding and Current Weather APIs, with an optional One Call integration (`src/weather-service.js`) |
| Return response in Dialogflow Chat | Valid `fulfillmentText` and `fulfillmentMessages` WebhookResponse |
| Architecture: Dialogflow ↔ webhook ↔ weather APIs | README Mermaid sequence and runtime implementation |
| Record working bot demo | Ready-to-read voiceover in `docs/DEMO_SCRIPT.md` |
| Voiceover explaining video | Full timed narration supplied |
| Public GitHub repository | Repository is prepared; account owner must push it publicly |
| Email agent ZIP and repository link | ZIP produced; exact final checklist in `docs/SUBMISSION_CHECKLIST.md` |
| Seven-day timeline | Checklist includes submission timing verification |

## Additional quality evidence

- Live dashboard and normalized REST endpoints make evaluation possible even outside Dialogflow.
- OpenAPI 3.1 contract documents the integration surface.
- Request deadlines stay under Dialogflow ES's non-Assistant five-second webhook limit.
- Caching reduces OpenWeather usage and improves response time.
- Optional constant-time shared-secret verification protects the public webhook.
- Structured logs redact credentials and include request IDs and latency.
- Tests cover boundary conditions without consuming provider quota.
