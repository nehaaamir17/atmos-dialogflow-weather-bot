# Final submission checklist

Complete this list in order on the day of submission.

## Product verification

- [ ] OpenWeather One Call by Call is active and the key works.
- [ ] Public base URL loads the dashboard over HTTPS.
- [ ] `/healthz` returns HTTP 200.
- [ ] `/readyz` returns HTTP 200 with `openWeatherApiKey: true`.
- [ ] Dialogflow Fulfillment URL is `https://YOUR-HOST/webhook`.
- [ ] Optional `x-webhook-secret` values match in Dialogflow and hosting variables.
- [ ] Dialogflow agent training has completed.
- [ ] Current weather slot-filling conversation works.
- [ ] Forecast request within the next eight days works.
- [ ] Thanks and goodbye flow works.
- [ ] No API key or webhook secret is visible in the repository, video, dashboard, or logs.

## Repository verification

- [ ] Replace any personal placeholders in the README or repository description.
- [ ] Run `npm run check`.
- [ ] Run `npm test`.
- [ ] Confirm `dist/Weather-Info-Forecast-Bot.zip` imports into a clean Dialogflow ES agent.
- [ ] Push the final commit to a **public** GitHub repository.
- [ ] Open the repository in an incognito/private browser window to confirm public access.
- [ ] Add the deployed dashboard/base URL to the GitHub repository About section.
- [ ] Add the demo video link to the README or GitHub release if sharing by link.

## Demo video verification

- [ ] Screen recording shows the Dialogflow ES console, not Dialogflow CX.
- [ ] Voiceover is present and understandable.
- [ ] Video demonstrates the exact required conversation.
- [ ] Video shows fulfillment configuration and a successful webhook response.
- [ ] Video shows tests passing.
- [ ] Video does not expose secrets or billing information.
- [ ] Uploaded video permissions allow the evaluator to view it without requesting access.

## Email to `submissions@interactcx.com`

Suggested subject:

```text
Evaluation Test 1 Submission – Weather Info & Forecast Bot – YOUR NAME
```

Suggested body:

```text
Hello Interact CX Team,

Please find my Evaluation Test 1 submission below:

Public repository: REPOSITORY_URL
Live dashboard / API base URL: DEPLOYED_BASE_URL
Dialogflow webhook: DEPLOYED_BASE_URL/webhook
Narrated demo video: VIDEO_URL

The Dialogflow ES agent ZIP is attached as Weather-Info-Forecast-Bot.zip. Setup and testing notes are included in the repository README.

Thank you for your time and consideration.

Best regards,
YOUR NAME
```

- [ ] Attach `dist/Weather-Info-Forecast-Bot.zip`.
- [ ] Include the public repository link.
- [ ] Include the live dashboard/API base URL.
- [ ] Include the narrated demo video link.
- [ ] Send within seven days of receipt acknowledgement, preferably earlier if requested.

