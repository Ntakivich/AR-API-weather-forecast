# Activity Ranking API: spec-first acceptance suite

A BDD acceptance suite written **before** the Activity Ranking API exists. Feature files in Gherkin pin
down the intended behaviour. Playwright (through [playwright-bdd](https://github.com/vitalets/playwright-bdd))
runs them against the API, with Open-Meteo replaced by a WireMock stub. Allure reports why each
scenario fails.

> **Expected state: red.** All 99 acceptance scenarios fail with
> `Activity Ranking API is not reachable … the service is not implemented yet`. Each failure names
> the request that was sent and the outcome the scenario expects.

## Quick start

```bash
npm ci
npm run test:docker        # one command: WireMock + the suite in Docker (same as CI)
```

Without Docker (needs a WireMock on `localhost:8080`, e.g. `npm run stubs:start`):

```bash
npm test                   # acceptance scenarios against API_BASE_URL (default http://localhost:3000)
npm run test:smoke         # @smoke subset
npm run test:live          # checks the stub against the live Open-Meteo API (network required)
npm run report:allure && npm run report:allure:open
npm run verify             # types, lint, formatting, OpenAPI lint, every Gherkin step bound
```

Configuration: copy [.env.example](.env.example) to `.env` (git-ignored, loaded automatically) or set
`API_BASE_URL` and `WEATHER_PROVIDER_STUB_URL` in the environment, which takes precedence.

## Approach

### 1. The contract is written first

[contract/activity-ranking-api.openapi.yaml](contract/activity-ranking-api.openapi.yaml) (OpenAPI 3.1)
defines what developers build against. TypeScript types are generated from it (`npm run contract:types`)
and every response is validated against it at runtime. A field the contract doesn't define is a
failure, not something quietly ignored.

### 2. Scenarios mapped to the acceptance criteria

| Acceptance criterion                                | Feature                                                                               | Scenarios |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | --------: |
| Accepts a city or town name                         | [activity-rankings.feature](features/activity-rankings.feature)                       |        33 |
| Accepts a partial name, returns possible matches    | [location-search.feature](features/location-search.feature)                           |        29 |
| Fetches 7-day weather from Open-Meteo               | [weather-provider-integration.feature](features/weather-provider-integration.feature) |        16 |
| Ranks each day for each activity by weather         | [activity-ranking-behaviour.feature](features/activity-ranking-behaviour.feature)     |        21 |
| Response has date, activity, suitability, reasoning | activity-rankings.feature (rule _"covers every activity…"_)                           |         ↑ |
| Stub stays faithful to Open-Meteo                   | [live-weather-provider.feature](features/live-weather-provider.feature)               |         6 |

The scenarios also cover the front end's needs: autocomplete behaviour, telling same-named places
apart, plain-language reasons, response-time budgets, problem details safe to display, and a
user journey from search to choosing a place to rankings.

### 3. Test design techniques

| Technique                 | Where                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Equivalence classes**   | City/query input: single and multi-word names, hyphens, apostrophes, accents, letter case, surrounding spaces. Invalid inputs: missing, empty, whitespace-only, non-numeric/zero/negative/fractional ids. Hostile inputs: markup, SQL, path traversal, non-Latin script, emoji                                                                  |
| **Boundary values**       | Query and city length 1 / 2 / 3 / 100 / 101, result limit 0 / 1 / 20 / 21, extreme weather (46 °C, -45 °C, 200 cm of snow)                                                                                                                                                                                                                      |
| **Decision table**        | Clear-cut weather with an obvious winner (heavy snow → Skiing, clean swell → Surfing, clear and warm → Outdoor, storm → Indoor) plus the activity that must be rated poor                                                                                                                                                                       |
| **Metamorphic relations** | Without an exact scoring formula, assert _direction_: day 2 differs from day 1 by one factor only, so more snow can't lower Skiing and more rain can't raise Outdoor Sightseeing. Identical weather must give identical assessments                                                                                                             |
| **Pairwise**              | 6 weather factors (3 to 4 levels each, 1,296 combinations). All 166 pairs of levels are covered in 20 days, generated by [scripts/generate-pairwise-weather-days.ts](scripts/generate-pairwise-weather-days.ts). These rows check invariants: four unique activities, ranks 1 to 4 that follow the scores, scores 0 to 100, at least one reason |
| **State transitions**     | Search → pick a place → rankings. Rankings for "Paris" (France) → pick the alternative Paris, US → rankings                                                                                                                                                                                                                                     |
| **Fault injection**       | Open-Meteo 500, an HTML 503 page, malformed JSON, an unexpected JSON shape, a dropped connection, a response slower than the service timeout, and a marine-only outage                                                                                                                                                                          |

Ranking scenarios never pin exact scores. The scoring model belongs to the developers and will be
tuned; the suite pins the behaviour any sensible model must show.

### 4. Open-Meteo is replaced by a WireMock simulator

The service calls Open-Meteo from its own process, so in-process mocks (`page.route`, MSW) can't
intercept those calls. Instead, the service is expected to read the Open-Meteo base URLs from
`OPEN_METEO_GEOCODING_URL`, `OPEN_METEO_FORECAST_URL` and `OPEN_METEO_MARINE_URL`. The suite points
them at WireMock.

- **[Place catalogue](src/stubs/weather-provider/place-catalogue.ts)**: 18 real geocoding records
  captured from the live API, including deliberate name clashes (London GB/CA/US, Paris FR/US).
- **[Geocoding simulator](src/stubs/weather-provider/open-meteo-response-builders.ts)**: follows
  Open-Meteo's own matching rules (prefix match from 3 characters, exact match at 2, case- and
  accent-insensitive).
- **[Named weather conditions](src/stubs/weather-provider/daily-weather.ts)** and
  **[weather factors](src/stubs/weather-provider/weather-factors.ts)** keep the Gherkin readable
  (`"heavy snow and freezing"`) instead of raw numbers.
- **Behaviours copied from the live API**: an empty search omits `results` entirely. Inland marine
  requests return 200 with `null` wave values, not an error. An unknown id returns
  `400 "Location ID not found."`.
- **Checking what the service sent**: WireMock's request log shows whether the service asked for the
  right coordinates, 7 days and local time. Requests no stub answered are attached to the report.
- **Drift protection**: `npm run test:live` compares the stub's response structure and place
  catalogue with live Open-Meteo, so the stub can't silently drift from the real API.

### 5. A meaningful red state

- **When the service is missing**, scenarios fail at their first `Then` step with the request that
  was sent and the expected outcome:
  ```
  Activity Ranking API is not reachable at http://localhost:3000 (connect ECONNREFUSED).
  Spec-first suite: the service is not implemented yet, so this scenario is expected to be red.
    Request sent:     GET /v1/activity-rankings?city=Chamonix
    Expected outcome: "Skiing" is ranked first on every day
  ```
- **When the service exists but is wrong**, ranking failures show the stubbed weather and the actual
  ranking for every failing day. Contract failures list each violation by readable path, e.g.
  `days[2].activities[1].suitabilityScore: must be <= 100, actual 140`.
- **Failures are sorted by cause in Allure**: _Not implemented yet_, _Contract violation_,
  _Ranking behaviour_, _Location resolution_, _Weather provider integration_, _Front-end
  expectation_, _Stub drift_. Right now every scenario sits in _Not implemented yet_. Once the
  service exists, the same categories become a triage board.
- **The report is generated from the Gherkin**: epic, feature and story come from the Feature and
  Rule, and the free-text descriptions explain _why_ each scenario matters. Every HTTP call is a
  report step with the request and response attached.
- **No false passes**: every assertion first requires a real answer from the service, so a check
  like "no forecast was requested" can't pass when nothing ran.

The suite itself was verified against a temporary reference implementation (not part of this
repository). All 99 scenarios passed, and planted defects (inverted ranking, invented values for
missing data, plain-JSON error responses) were caught by the expected scenarios.

## API contract (summary)

| Endpoint                                       | Purpose                                                 | Main responses                                                       |
| ---------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /v1/locations?query=Cham&limit=10`        | Autocomplete: full or partial name                      | `200` matches (empty list when nothing matches), `400`, `502`, `504` |
| `GET /v1/activity-rankings?city=Chamonix`      | Rankings by name (most relevant exact match)            | `200` report, `400`, `404` with suggestions, `502`, `504`            |
| `GET /v1/activity-rankings?locationId=6058560` | Rankings for a place picked from search or alternatives | `200`, `400`, `404`, `502`, `504`                                    |
| `GET /health`                                  | Liveness                                                | `200`                                                                |

```jsonc
// GET /v1/activity-rankings?city=London   (one day and one activity shown)
{
  "location": {
    "id": 2643743,
    "name": "London",
    "region": "England",
    "country": "United Kingdom",
    "countryCode": "GB",
    "latitude": 51.50853,
    "longitude": -0.12574,
    "timezone": "Europe/London",
  },
  "alternativeMatches": [
    { "id": 6058560, "name": "London", "region": "Ontario", "countryCode": "CA", "…": "…" },
  ],
  "units": {
    "temperature": "°C",
    "snowfall": "cm",
    "precipitation": "mm",
    "windSpeed": "km/h",
    "waveHeight": "m",
  },
  "days": [
    {
      "date": "2026-10-14",
      "activities": [
        {
          "activity": "Indoor Sightseeing",
          "rank": 1,
          "suitabilityScore": 82,
          "suitabilityRating": "EXCELLENT",
          "reasons": ["Heavy rain expected (30 mm)", "Museums and galleries stay comfortable"],
        },
      ],
    },
  ],
}
```

Errors use RFC 9457 `application/problem+json` with types `/problems/invalid-request` (with
`invalidParams`), `/problems/location-not-found` (with `suggestions`),
`/problems/weather-provider-unavailable` and `/problems/weather-provider-timeout`.

## Assumptions to confirm

These decisions were made without a product owner. Each is marked in the contract or scenarios and
can be revised after feedback.

1. **"Ranks each day for each activity"** means the four activities are ranked _within each day_
   (1 = best), not the 7 days ranked per activity. The response carries both a rank and a score, so
   ranking days per activity can be added later.
2. **Same-named places**: `city=London` resolves to the most relevant exact match (largest
   population, as Open-Meteo orders results) and lists the others in `alternativeMatches`. Real data
   showed almost every name exists in several countries, so returning `409 Conflict` for any shared
   name would make the common case a two-step flow.
3. **A partial name passed as `city`** is not guessed. It returns `404` with prefix `suggestions`.
   Partial names are handled by `/v1/locations`.
4. **Suitability** is a `0–100` score plus a rating band: POOR 0–24, FAIR 25–49, GOOD 50–74,
   EXCELLENT 75–100. Equal scores are tie-broken in the fixed order Skiing, Surfing, Outdoor, Indoor.
5. **Missing forecast data** for a day gives `UNAVAILABLE` with a `null` score and an explanation,
   never a guessed value.
6. **Surfing inland** is rated POOR with a reason ("no coastal forecast"), not omitted. All four
   activities are always present. If only the marine API fails, Surfing is `UNAVAILABLE` and the
   other activities are still ranked.
7. **"Today"** is the date in the location's time zone. The service asks Open-Meteo for
   `timezone=auto` (or the place's time zone) and 7 days (`forecast_days=7`, or omitted since 7 is
   Open-Meteo's default).
8. **Validation limits**: names are 2–100 characters after trimming, `limit` is 1–20 (default 10).
   `city` and `locationId` can't be combined.
9. **Service levels**: 2 s response budget, 5 s timeout towards Open-Meteo, and a `504` within
   6.5 s. Open-Meteo errors map to `502`, timeouts to `504`, and problem details never reveal
   provider URLs or stack traces.
10. **The API is public** (no authentication) and English-only (`language=en` names, English reasons).

## Questions I would ask the team

- Should `city=` with a shared name pick the most relevant match (current assumption), or should the
  front end always go through search first?
- Is a 0–100 score with rating bands the right "measure of suitability" for the UI, or would
  stars or labels alone do?
- Should reasons be localised, and is the front end expected to translate them?
- What are the real latency targets for autocomplete and rankings, and is caching forecasts per
  location acceptable (and for how long)?
- Should Surfing be hidden for inland places rather than rated POOR?
- What happens near the Open-Meteo rate limit (10k calls/day for the free tier)? Should the service
  return `503` with `Retry-After`?
- Is commercial Open-Meteo (API key) planned? That changes configuration and error handling.

## Omissions and trade-offs

- **Serial execution** (`workers: 1`). The service and WireMock are each one shared instance, so
  parallel scenarios that stub different weather for the same city would collide. Per-worker service
  instances or data partitioning would allow parallel runs once the suite grows.
- **No exact scoring oracle** by design. Behaviour is pinned through a decision table, metamorphic
  relations and invariants instead.
- **No consumer-driven contract testing (Pact)**. The test suite is not a consumer of Open-Meteo;
  the service is. The `@live-weather-provider` checks cover drift from the provider side.
- **No performance or load testing.** Only per-request response-time budgets are asserted; k6 would
  be the next step once the service exists.
- **No caching, rate-limit or authentication scenarios**, because the brief doesn't define them (see
  the questions above).
- **Midnight edge case**: "today" is computed when the assertion runs, so a run that crosses midnight
  at the location could flake in the date scenarios.

## CI/CD

[.github/workflows/acceptance-suite.yml](.github/workflows/acceptance-suite.yml):

1. **Static checks** (must pass): types, ESLint, Prettier, OpenAPI lint, and `bddgen`, which fails on
   any unbound Gherkin step.
2. **Acceptance specification**: `npm run test:docker`, then an Allure report with run history and a
   job summary counting failures per category. The red result is allowed and flagged with a warning
   until the repository variable `ACCEPTANCE_SUITE_BLOCKS_BUILD=true` makes it a blocking check.
3. **Publish**: reports are committed to the `gh-pages` branch: `main/` for the main branch and
   `pr-<number>/` for each pull request, which also gets a single comment, updated on every run,
   with the summary and a report link. A pull request's report starts from main's history, and
   [remove-pull-request-report.yml](.github/workflows/remove-pull-request-report.yml) deletes it
   when the pull request closes. Pull requests from forks keep the downloadable artifact only.
4. **Live stub check** (manual): _Run workflow_ with _live-weather-provider_ ticked.

**One-time setup** after the first run has created the `gh-pages` branch: _Settings → Pages →
Build and deployment → Source: Deploy from a branch → `gh-pages` / `(root)`_. Reports are then served at
`https://<owner>.github.io/<repository>/main/` and `…/pr-<number>/`.

Secrets the service or suite may need later (API keys, tokens) go in _Settings → Secrets and
variables → Actions_, never in the repository. The workflow passes them as environment variables
(`env: API_KEY: ${{ secrets.API_KEY }}`), and `docker-compose.yml` forwards them into the containers
(`API_KEY: ${API_KEY:-}`). Locally they live in a git-ignored `.env`; [.env.example](.env.example)
lists the names without values.

## Project layout

```
contract/                  OpenAPI contract (source of truth)
features/                  Gherkin specifications
src/
  steps/                   step definitions, kept thin
  fixtures/                playwright-bdd fixtures, hooks and per-scenario context
  clients/                 Activity Ranking API client, live Open-Meteo client
  assertions/ matchers/    readable domain assertions and custom expect matchers
  stubs/                   WireMock admin client and the Open-Meteo simulator
  contract/                generated types, contract constants, schema validator
  reporting/               Allure metadata derived from the Gherkin
scripts/                   pairwise generator, CI helpers
allurerc.mjs               Allure 3 report configuration and failure categories
docker-compose.yml         WireMock + test runner (+ slot for the service)
```
