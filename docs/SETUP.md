# End-to-end setup

## 1. Activate OpenWeather One Call 3.0

1. Create or sign in to an OpenWeather account.
2. Create an API key.
3. Subscribe to **One Call by Call**. The plan includes a daily no-charge allowance but requires activation and billing details on OpenWeather.
4. Wait for a new key to activate; OpenWeather keys may not work immediately.

Set variables locally in PowerShell:

```powershell
$env:OPENWEATHER_API_KEY = "YOUR_KEY"
$env:PORT = "8080"
$env:DEFAULT_TIME_ZONE = "UTC"
npm start
```

Verify:

```powershell
Invoke-RestMethod http://localhost:8080/readyz
Invoke-RestMethod "http://localhost:8080/api/weather/current?city=Lahore%2C%20PK"
```

## 2. Import the Dialogflow ES agent

1. Go to `https://dialogflow.cloud.google.com/`.
2. Create a Dialogflow **ES** agent. Do not create a Dialogflow CX agent; their ZIP formats are incompatible.
3. Open the gear icon beside the agent name.
4. Select **Export and Import → Restore from ZIP**.
5. Upload `dist/Weather-Info-Forecast-Bot.zip` and type `RESTORE` when prompted.
6. Wait for training to complete.

The ZIP contains current weather, forecast, welcome, help, thanks, goodbye, and fallback intents. City uses `@sys.geo-city`; forecast date uses `@sys.date`.

## 3. Make the webhook publicly reachable

### Temporary ngrok option

With the API running on port 8080:

```powershell
ngrok http 8080
```

Copy the HTTPS forwarding URL, append `/webhook`, and keep ngrok running during the demo.

### Railway option

1. Push the repository to GitHub.
2. Create a Railway project from the repository.
3. Add `OPENWEATHER_API_KEY` as a Railway variable.
4. Optional: create a long random `WEBHOOK_SECRET` and add it as a second variable.
5. Generate the Railway public domain.
6. Check `https://YOUR-DOMAIN/healthz` and `https://YOUR-DOMAIN/readyz`.

## 4. Configure Dialogflow fulfillment

1. In Dialogflow ES, open **Fulfillment**.
2. Enable Webhook.
3. Enter the final HTTPS URL ending in `/webhook`.
4. If using `WEBHOOK_SECRET`, add a custom header named `x-webhook-secret` with the matching value.
5. Save.
6. Open each weather intent and confirm **Enable webhook call for this intent** is on. It is already set in the import, but this is a useful visual check for the demo.

## 5. Test the required flow

Run these in the Dialogflow test console:

1. `Hi`
2. `What is the current weather?`
3. `My city is Lahore`
4. `Please tell me the weather forecast from tomorrow for London`
5. `Thanks`
6. `No thanks`

Also demonstrate one controlled error:

- Ask for a nonexistent city to show the city-not-found response, or request a date more than seven days after today to show the eight-day limit.

## 6. Live production smoke test

Before recording, verify all four checks:

- `/healthz` returns HTTP 200.
- `/readyz` returns HTTP 200 and `openWeatherApiKey: true`.
- The dashboard returns current and forecast data.
- Both Dialogflow weather intents display webhook results without a fulfillment error.

