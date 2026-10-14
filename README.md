# Activity Ranking API: spec-first acceptance suite

A BDD acceptance suite written **before** the Activity Ranking API exists. Feature files in Gherkin pin
down the intended behaviour. Playwright (through [playwright-bdd](https://github.com/vitalets/playwright-bdd))
runs them against the API, with Open-Meteo replaced by a WireMock stub. Allure reports why each
scenario fails.

> **Expected state: red.** All 99 acceptance scenarios fail with
> `Activity Ranking API is not reachable … the service is not implemented yet`. Each failure names
> the request that was sent and the outcome the scenario expects.

## Contents

1. [Quick start](#quick-start)
2. [Approach](#approach): contract first, coverage per acceptance criterion, test design, the WireMock simulator, a meaningful red state
3. [The API contract](#the-api-contract): summary, how to read it, how to change it
4. [Writing and extending tests](#writing-and-extending-tests): from an idea to a running scenario, with a worked example
5. [Running and debugging](#running-and-debugging)
6. [When something fails: where to look](#when-something-fails-where-to-look)
7. [Assumptions to confirm](#assumptions-to-confirm) · [Questions I would ask the team](#questions-i-would-ask-the-team) · [Omissions and trade-offs](#omissions-and-trade-offs)
8. [CI/CD](#cicd) · [Project layout](#project-layout)

## Quick start

```bash
npm ci
npm run test:docker        # one command: WireMock + the suite in Docker (same as CI)
```

Without Docker for the suite itself (WireMock still runs in a container):

```bash
npm run stubs:start        # WireMock on localhost:8080
npm test                   # acceptance scenarios against API_BASE_URL (default http://localhost:3000)
npm run test:smoke         # @smoke subset
npm run test:live          # checks the stub against the live Open-Meteo API (network required)
npm run report:allure && npm run report:allure:open
npm run verify             # types, lint, formatting, OpenAPI lint, every Gherkin step bound
npm run stubs:stop
```

Configuration: copy [.env.example](.env.example) to `.env` (git-ignored, loaded automatically) or set
`API_BASE_URL` and `WEATHER_PROVIDER_STUB_URL` in the environment, which takes precedence.

## Approach

### 1. The contract is written first

[contract/activity-ranking-api.openapi.yaml](contract/activity-ranking-api.openapi.yaml) (OpenAPI 3.1)
defines what developers build against. TypeScript types are generated from it and every response is
validated against it at runtime. A field the contract doesn't define is a failure, not something
quietly ignored. See [The API contract](#the-api-contract) for how to read and change it.

### 2. Scenarios mapped to the acceptance criteria

| Acceptance criterion                                | Feature                                                                               | Scenarios |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | --------: |
| Accepts a city or town name                         | [activity-rankings.feature](features/activity-rankings.feature)                       |        33 |
| Accepts a partial name, returns possible matches    | [location-search.feature](features/location-search.feature)                           |        29 |
| Fetches 7-day weather from Open-Meteo               | [weather-provider-integration.feature](features/weather-provider-integration.feature) |        16 |
| Ranks each day for each activity by weather         | [activity-ranking-behaviour.feature](features/activity-ranking-behaviour.feature)     |        21 |
| Response has date, activity, suitability, reasoning | activity-rankings.feature (rule _"covers every activity…"_)                           |         ↑ |
| Stub stays faithful to Open-Meteo                   | [live-weather-provider.feature](features/live-weather-provider.feature)               |         6 |

Each acceptance criterion is a `Rule:` in its feature file, so the report groups scenarios by criterion.
The scenarios also cover the front end's needs: autocomplete behaviour, telling same-named places
apart, plain-language reasons, response-time budgets, problem details safe to display, and a user
journey from search to choosing a place to rankings.

**Where the four response fields are checked:**

| Field                  | Structure (every ranking scenario)                                                                                                                      | Meaning (specific scenarios)                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                   | `toSatisfyContract('ActivityRankingReport')`: every field is present, typed and within its limits; `additionalProperties: false` rejects unknown fields | _7 consecutive days starting today at the location_, _"Today" is the date in Auckland/Honolulu_                                                                                                                                                                                                   |
| Activity name          | ↑                                                                                                                                                       | _Every day lists each activity exactly once_ and the pairwise weeks                                                                                                                                                                                                                               |
| Measure of suitability | ↑                                                                                                                                                       | _The suitability rating always agrees with the score_ and every ranking-behaviour scenario                                                                                                                                                                                                        |
| Reasoning              | ↑ (at least one non-empty reason)                                                                                                                       | _Every activity explains its assessment in plain language_: no provider codes, field names or `null`, and Skiing quotes the snowfall in cm ("High snowfall expected"). Also checked: missing data and inland Surfing explain themselves. Exact wording is never pinned; it's the developers' copy |

### 3. Test design techniques

| Technique                 | Where                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Equivalence classes**   | City/query input: single and multi-word names, hyphens, apostrophes, accents, letter case, surrounding spaces. Invalid inputs: missing, empty, whitespace-only, non-numeric/zero/negative/fractional ids. Hostile inputs: markup, SQL, path traversal, non-Latin script, emoji |
| **Boundary values**       | Query and city length 1 / 2 / 3 / 100 / 101, result limit 0 / 1 / 20 / 21, extreme weather (46 °C, -45 °C, 200 cm of snow)                                                                                                                                                     |
| **Decision table**        | Clear-cut weather with an obvious winner (heavy snow → Skiing, clean swell → Surfing, clear and warm → Outdoor, storm → Indoor) plus the activity that must be rated poor                                                                                                      |
| **Metamorphic relations** | Without an exact scoring formula, assert _direction_: day 2 differs from day 1 by one factor only, so more snow can't lower Skiing and more rain can't raise Outdoor Sightseeing. Identical weather must give identical assessments                                            |
| **Pairwise**              | Every pair of levels of any two weather factors occurs on at least one day: 20 days instead of 1,296 combinations. [How it works](#how-pairwise-coverage-works)                                                                                                                |
| **State transitions**     | Search → pick a place → rankings. Rankings for "Paris" (France) → pick the alternative Paris, US → rankings                                                                                                                                                                    |
| **Fault injection**       | Open-Meteo 500, an HTML 503 page, malformed JSON, an unexpected JSON shape, a dropped connection, a response slower than the service timeout, and a marine-only outage                                                                                                         |

Ranking scenarios never pin exact scores. The scoring model belongs to the developers and will be
tuned; the suite pins the behaviour any sensible model must show.

#### How pairwise coverage works

**The problem.** Six weather factors drive suitability. Each is split into equivalence classes
(levels), chosen at the points where an activity's suitability plausibly changes:

| Factor      | Levels (value used in the stub)                                                                  | Why these levels                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| temperature | freezing (-15…-8 °C), cold (-2…3 °C), mild (8…15 °C), hot (24…34 °C)                             | snow stays skiable below 0 °C; sightseeing is comfortable when mild; heat stress when hot |
| snowfall    | none (0 cm), light (5 cm), heavy (35 cm)                                                         | no skiing, marginal skiing, a powder day                                                  |
| rain        | none (0 mm), light (3 mm), heavy (30 mm)                                                         | outdoor fine, outdoor tolerable, indoor preferred                                         |
| wind        | calm (5 km/h), breezy (25 km/h), gale (70 km/h)                                                  | lifts close and the sea becomes unsafe in a gale                                          |
| waves       | no marine data (`null`, as inland), flat (0.3 m / 5 s), surfable (1.8 m / 12 s), dangerous (6 m) | no surf, too small, good surf, unsafe                                                     |
| sky         | clear, overcast, thunderstorm (WMO codes 0, 3, 95)                                               | sightseeing appeal and safety                                                             |

All combinations: 4 × 3 × 3 × 3 × 4 × 3 = **1,296**. Most defects are triggered by one factor or by an
interaction of **two** factors (for example hot weather with heavy snow, or a gale with surfable waves).
Pairwise testing therefore covers every pair of levels of any two factors (166 pairs) in as few days
as possible.

**The algorithm** ([scripts/generate-pairwise-weather-days.ts](scripts/generate-pairwise-weather-days.ts)):
take any pair that is not covered yet as the seed of a new day, then fill the remaining factors with
the level that covers the most still-uncovered pairs, and repeat until every pair is covered. It is
greedy, deterministic and has no dependencies, and produces **20 days**. The theoretical minimum is 16
(the two 4-level factors alone have 4 × 4 pairs); a dedicated tool such as PICT would get closer, at
the cost of a dependency.

**Where it's used.** `features/activity-ranking-behaviour.feature`, rule _"Any combination of weather
produces a well-formed ranking"_. One API call returns 7 days, so the 20 days are packed into three
scenarios ("Pairwise week 1/2/3"), each a table of 7 days:

```gherkin
Given the weather in "Biarritz" day by day is:
  | day | temperature | snowfall | rain  | wind | waves          | sky   |
  | 1   | freezing    | none     | none  | calm | no marine data | clear |
  …
```

The step turns each row into Open-Meteo data with `composeDailyWeather` in
[weather-factors.ts](src/stubs/weather-provider/weather-factors.ts). Biarritz is coastal, so the wave
levels reach the marine stub. A day not listed in a week keeps unremarkable weather.

**What it asserts.** Many combinations are deliberately unrealistic (hot with heavy snow) and have no
obvious best activity, so these scenarios assert **invariants** instead of a winner:

- the response matches the contract
- four unique activities per day
- ranks 1 to 4 without ties that follow the scores
- scores within 0–100
- at least one reason per activity

**To change the levels:** edit `WEATHER_FACTOR_LEVELS`, run `npm run pairwise:generate`, and paste the
printed tables into the three scenarios. Add or remove a "Pairwise week" scenario if the number of
weeks changes.

### 4. Open-Meteo is replaced by a WireMock simulator

The service is expected to read the Open-Meteo base URLs from `OPEN_METEO_GEOCODING_URL`,
`OPEN_METEO_FORECAST_URL` and `OPEN_METEO_MARINE_URL`, defaulting to the real Open-Meteo. In tests they
point at WireMock, so the suite controls which places exist, what the weather is and how the provider
fails.

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

#### Why WireMock, not request interception or spies

| Option                                                             | Why it doesn't fit here                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright `page.route()` / `context.route()` interception         | Intercepts traffic of the browser or test runner only. The service calls Open-Meteo from **its own process**, so that traffic never passes through Playwright                                                                                                    |
| In-process mocks (nock, MSW for Node) or spies (sinon, jest.spyOn) | Must run **inside** the service: test-only hooks in production code, tied to the service's language and HTTP library, and spies on internal functions test the implementation, not behaviour. They break on refactoring and can't run against a deployed service |
| Recording real responses (VCR style)                               | Real weather changes daily, so recordings can't express "heavy snow on day 3" or a timeout on demand                                                                                                                                                             |

WireMock runs **outside** the service, as a separate HTTP server. The service is tested as deployed,
and only its configuration differs.

- **Behaving like a spy, from the outside:** the request journal shows what the service sent
  (coordinates, `forecast_days`, `timezone`) without touching its code.
- **Network-level faults:** 5xx, delays, dropped connections, malformed bodies.
- **Language-independent:** it works the same locally, in Docker, in CI or against a staging
  deployment, and developers can reuse it to run the service locally.

The costs:

- **Docker (or Java) is needed.** Mitigated: `npm run stubs:start` or `npm run test:docker`.
- **The service must make the Open-Meteo URLs configurable.** Stated in the contract.
- **WireMock is shared state.** Mitigated: it is reset before every scenario, and runs are serial.

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
repository). All 99 scenarios passed, both locally and through `npm run test:docker`, and planted
defects (inverted ranking, invented values for missing data, plain-JSON error responses) were caught
by the expected scenarios.

## The API contract

### Summary

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

### How to read the contract

The file has the standard OpenAPI sections:

| Section                 | What it holds                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `info`                  | Title, version and the description, including the requirement that the Open-Meteo URLs are configurable                                                                                                                                                                                                                  |
| `security`, `servers`   | `security: []` records the assumption that the API is public; the local server URL                                                                                                                                                                                                                                       |
| `paths`                 | One entry per endpoint. Each operation lists its `parameters` and `responses` by status code, mostly as `$ref` links to `components`                                                                                                                                                                                     |
| `components.parameters` | Query parameters with their limits (`SearchQuery` 2–100 characters, `SearchResultLimit` 1–20…). These limits are the boundary values the scenarios test                                                                                                                                                                  |
| `components.responses`  | Reusable error responses (`InvalidRequest`, `LocationNotFound`, `WeatherProviderUnavailable`, `WeatherProviderTimeout`)                                                                                                                                                                                                  |
| `components.schemas`    | The data shapes: `Location`, `LocationSearchResult`, `ActivityRankingReport` → `DailyActivityRanking` → `ActivityAssessment` (with the `ActivityName` and `SuitabilityRating` enums), `MeasurementUnits`, and the `Problem` family (`InvalidRequestProblem` and `LocationNotFoundProblem` extend `Problem` with `allOf`) |

**To read an endpoint:** start at `paths`, follow each `$ref` to its schema, then read the rules on
each schema:

- `required`: fields that must be present
- `additionalProperties: false`: nothing else is allowed
- `enum`, `const`: allowed values
- `minimum`/`maximum`, `minLength`/`maxLength`, `minItems`/`maxItems`: limits
- `format: date`: ISO calendar date

To browse it as documentation:

```bash
npx redocly build-docs contract/activity-ranking-api.openapi.yaml -o contract-docs.html   # then open the HTML
```

**How the suite uses it:**

- `npm run contract:types` generates [src/contract/generated/activity-ranking-api.ts](src/contract/generated/activity-ranking-api.ts). Never edit it by hand.
- [contract-validator.ts](src/contract/contract-validator.ts) compiles `components.schemas` with ajv
  (a JSON Schema validator).
- The matcher `toSatisfyContract('<SchemaName>')` validates a response against one schema.
- [activity-ranking-contract.ts](src/contract/activity-ranking-contract.ts) holds the values steps
  assert against: endpoints, activity names, limits, problem types, service levels.

### How to change the contract

1. Edit the YAML. For a new response field, add it under the schema's `properties`, and to
   `required` if it is mandatory. A new endpoint goes under `paths`.
2. `npm run contract:lint`: Redocly checks the document ([redocly.yaml](redocly.yaml) holds its rules).
3. `npm run contract:types`: regenerates the TypeScript types. Commit them with the YAML.
4. Update [activity-ranking-contract.ts](src/contract/activity-ranking-contract.ts) if an endpoint,
   limit or enum changed. `npm run typecheck` flags steps that no longer match the types.
5. Add or adjust scenarios and steps for the new behaviour (see the next section), then
   `npm run verify` and run the affected scenarios.

Because of `additionalProperties: false`, the service can't add a field until the contract has it:
that is the point of contract-first. For changes that would break existing consumers (removing or
renaming a field, tightening a limit), bump `info.version` and agree with the front end first; new
versions go under a new path prefix (`/v2`).

## Writing and extending tests

### From an idea to a running scenario

A product manager can write steps 1 and 2 using the existing step vocabulary; a developer or SDET
completes the rest.

1. **Pick the feature file.** Rankings content → `activity-rankings.feature`; ranking logic →
   `activity-ranking-behaviour.feature`; search → `location-search.feature`; Open-Meteo usage and
   failures → `weather-provider-integration.feature`. For a new capability, create
   `features/<capability>.feature` with a tag naming the area (`@favourites`), a `Feature:` written as
   a user story, a description of why it matters, and one `Rule:` per acceptance criterion.
2. **Write the scenario declaratively**: business language, one behaviour per scenario, a title that
   states the expected behaviour. Reuse existing steps. To list all 84 of them:
   ```bash
   npx bddgen export
   ```
3. **Run `npx bddgen`.** It fails for every line without a step definition and prints a ready-to-paste
   snippet.
4. **Implement the step** in the steps file for that domain (see [Step definitions](#step-definitions)).
5. **Add test data if needed**:
   - a weather condition in `WEATHER_CONDITIONS` ([daily-weather.ts](src/stubs/weather-provider/daily-weather.ts))
   - a provider failure in `PROVIDER_FAILURE_MODES` ([weather-provider-stub.ts](src/stubs/weather-provider/weather-provider-stub.ts))
   - a place in [place-catalogue.ts](src/stubs/weather-provider/place-catalogue.ts), with its record
     copied from the live API:
     `curl "https://geocoding-api.open-meteo.com/v1/search?name=Oslo&count=3"`
6. **Run only that scenario** (see [Running and debugging](#running-and-debugging)). Until the service
   exists, it should fail with "not reachable" and an `Expected outcome:` line repeating your step.
7. **`npm run verify`**, then open a pull request. CI runs everything and comments with the report.

If the behaviour needs a new response field or endpoint, change [the contract](#how-to-change-the-contract) first.

### Worked example: "Clear skies and 22°C"

The brief's reasoning example "High snowfall expected" is checked (Skiing must quote the snowfall
in cm), but "Clear skies and 22°C" is not yet. This is how to add it.

**1. Gherkin**, in `features/activity-rankings.feature`, rule _"The response covers every activity…"_:

```gherkin
@front-end-experience
Scenario: Clear, warm weather is explained with the sky and the temperature
  Given the weather in "Lisbon" is "clear and warm" all week
  When the user requests activity rankings for "Lisbon"
  Then the reasons for "Outdoor Sightseeing" mention the sky and the temperature in °C
```

The `Given` and `When` steps already exist: `"clear and warm"` is a named condition (22 °C, clear sky)
and Lisbon is in the catalogue.

**2. `npx bddgen`** reports the one new step:

```
Missing step definitions: 1

Then('the reasons for {string} mention the sky and the temperature in °C', async ({}, arg: string) => {
  // Step: Then the reasons for "Outdoor Sightseeing" mention the sky and the temperature in °C
  // From: features/activity-rankings.feature:165:7
});
```

**3. Step definition.** It goes in `src/steps/ranking-behaviour.steps.ts`, next to the other reason
checks, and is built from the existing helpers:

```ts
const CLEAR_SKY_REASON_PATTERN = /clear|sunny|sunshine/i;
const TEMPERATURE_IN_CELSIUS_PATTERN = /-?\d+(?:[.,]\d+)?\s?°C/;

Then(
  'the reasons for {string} mention the sky and the temperature in °C',
  ({ scenario, weatherProvider }, activityText: string) => {
    const activity = parseActivityName(activityText); // unknown names fail with the list of valid ones
    expectDays(
      expectRankingEvidence(scenario, weatherProvider), // requires an answered, contract-valid report first
      `the reasons for ${activity} describe the sky and quote the temperature (e.g. "Clear skies and 22°C")`,
      ({ day }) => {
        const reasons = assessmentOf(day, activity)?.reasons ?? [];
        const allReasons = reasons.join(' ');
        return CLEAR_SKY_REASON_PATTERN.test(allReasons) && TEMPERATURE_IN_CELSIUS_PATTERN.test(allReasons)
          ? undefined // the day meets the expectation
          : `reasons are ${JSON.stringify(reasons)}`; // why it doesn't, shown per failing day
      },
    );
  },
);
```

**4. Run it:**

```bash
npm run stubs:start
npm test -- --grep "explained with the sky"
```

Without a service it fails with:

```
Expected outcome: the reasons for "Outdoor Sightseeing" mention the sky and the temperature in °C
```

Against a service with plain reasons it fails with the full ranking and the stubbed weather for each
day. This example was run red against no service and green against the reference implementation.

### Step definitions

- **Where:** `src/steps/<domain>.steps.ts`. All files are loaded and steps are matched **by text**,
  so the file and position don't affect matching. Files are split by domain only so people can find
  steps. Two definitions matching the same text is an error.
- **Shape:** `Given/When/Then(pattern, async ({ fixtures… }, ...arguments) => {…})`.
  - The pattern is a Cucumber expression (`{string}`, `{int}`, `{}`) or a regular expression.
  - The first parameter **must** destructure the fixtures it needs, because that's how Playwright
    knows what to create.
- **Roles:**
  - `Given` arranges the world (`weatherProvider.setWeatherForWholeWeek…`, `failEveryCallTo…`).
  - `When` prepares the stubs and calls the API: `scenario.rememberOutcome(await activityRankingApi.…)`.
  - `Then` starts from a precondition helper (`expectRankingReport`, `expectRankingEvidence`,
    `expectLocationSearchResult`…), then checks with `expectDays`, the custom matchers or a
    domain error.
- **Failure messages** start with a stable prefix ("Ranking expectation not met", "Front-end
  expectation not met", "Location resolution differs…", "Weather provider integration"…).
  [allurerc.mjs](allurerc.mjs) uses those prefixes to sort failures into categories. A new kind of
  failure needs a new prefix and a new category there.
- **Fixtures** available to every step: `scenario` (per-scenario state), `activityRankingApi`,
  `weatherProvider` (WireMock driver), `liveWeatherProvider`. New ones are added in
  [scenario-fixtures.ts](src/fixtures/scenario-fixtures.ts).

## Running and debugging

| Goal                                        | Command                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Everything, as CI does                      | `npm run test:docker`                                                                                                                     |
| Everything, locally                         | `npm run stubs:start`, then `npm test`                                                                                                    |
| One feature file                            | `npm test -- location-search`                                                                                                             |
| One scenario (by title)                     | `npm test -- --grep "Typing the start of a city name"`                                                                                    |
| By tag / excluding a tag                    | `npm test -- --grep @security` / `npm test -- --grep-invert @resilience`                                                                  |
| A subset inside Docker                      | `docker compose run --rm --build acceptance-tests sh -c 'npx tsx scripts/wait-for-weather-provider-stub.ts && npm test -- --grep @smoke'` |
| Against a running service                   | `API_BASE_URL=http://localhost:4000 npm test` (the service must use WireMock on `localhost:8080` as Open-Meteo)                           |
| Against a service on your host, from Docker | `API_BASE_URL=http://host.docker.internal:3000 npm run test:docker`                                                                       |

**Debugging:**

- **UI mode:** `npx bddgen && npx playwright test --ui --project=acceptance`. It lists every
  scenario and lets you step through the Gherkin steps and see the request and response attachments
  of each call. Re-run `npx bddgen` after editing a `.feature` file.
- **Breakpoints:** install the _Playwright Test for VS Code_ extension, put a breakpoint in a
  `src/steps/*.ts` file and run the scenario with _Debug Test_ from the Testing panel. From the
  terminal, add `--timeout=0` so a paused scenario doesn't time out.
- **Inspecting the stub:** while a scenario is paused, or after running a single scenario (WireMock
  is reset at the start of each one), open `http://localhost:8080/__admin/mappings` (active stubs),
  `/__admin/requests` (what the service sent) and `/__admin/requests/unmatched`.
- **Generated tests:** `.features-gen/*.spec.js` shows how each Gherkin line maps to a step call. It's
  regenerated by `bddgen`, so never edit it.
- **Step navigation and autocomplete** in `.feature` files: the _Cucumber_ VS Code extension with
  `"cucumber.glue": ["src/steps/**/*.ts"]` and `"cucumber.features": ["features/**/*.feature"]` in your settings.

## When something fails: where to look

**Read the first line of the failure.** The prefix tells you the cause, and the same prefixes are the
Allure categories.

| Failure starts with                                  | Meaning                                                         | Where to look                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Activity Ranking API is not reachable`              | Nothing listens on `API_BASE_URL`                               | Expected until the service exists. Otherwise check that the service runs and `API_BASE_URL` (`.env`, environment, compose)    |
| `Activity Ranking API did not answer`                | The service accepted the connection but never responded         | Service logs and its upstream timeout                                                                                         |
| `Weather provider stub (WireMock) is not reachable`  | Test environment problem, not a finding                         | `npm run stubs:start`, `docker compose ps`, `WEATHER_PROVIDER_STUB_URL`                                                       |
| `Contract violation`                                 | The response doesn't match the OpenAPI schema                   | The readable path in the message (`days[2]…`) against the schema in the contract                                              |
| `Unexpected HTTP status or problem details`          | Wrong status, content type or problem body                      | The response body preview in the message; the _Response_ attachment in Allure                                                 |
| `Location resolution differs from the specification` | A different place was chosen, or wrong matches or suggestions   | Expected and actual places with ids in the message; ids in the place catalogue                                                |
| `Ranking expectation not met`                        | Ranking behaviour is wrong                                      | Each failing day lists the stubbed weather and the actual ranking, scores and reasons                                         |
| `Weather provider integration`                       | The service sent wrong or missing requests to Open-Meteo        | The requests WireMock received are listed in the message; Allure attachment _Weather provider requests with no matching stub_ |
| `Front-end expectation not met`                      | Response time, readable reasons, form field names, dates        | The message; durations in the Allure _Response_ attachment titles                                                             |
| `Stub drift`                                         | Live Open-Meteo changed (live checks only)                      | Update the payload types, builders or catalogue in `src/stubs/weather-provider/`                                              |
| `Step definition error: …`                           | A step was used out of order (e.g. checking before any request) | The scenario's Gherkin                                                                                                        |
| `Unknown weather condition / activity / place …`     | Typo in the Gherkin                                             | The message lists the valid values                                                                                            |
| `Missing step definitions` (from `bddgen`)           | A Gherkin line has no step                                      | The printed snippet ([Writing and extending tests](#writing-and-extending-tests))                                             |

**Where the output lives:**

| Output                     | Location                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal                   | Failure messages and the list of failed scenarios                                                                                                  |
| Allure report              | `npm run report:allure && npm run report:allure:open`: grouped by acceptance criterion, failures by category, request/response per call            |
| Playwright HTML report     | `npx playwright show-report`                                                                                                                       |
| Per-scenario error context | `test-results/<scenario>/error-context.md`                                                                                                         |
| Raw results                | `allure-results/` (cleared before each run)                                                                                                        |
| CI                         | Job summary, the pull request comment, the `acceptance-reports` artifact, and the published report at `…github.io/<repo>/main/` or `/pr-<number>/` |

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
contract/
  activity-ranking-api.openapi.yaml   the API contract: source of truth for shapes, limits and errors
features/                             Gherkin specifications, one Rule per acceptance criterion
  location-search.feature             autocomplete / partial names
  activity-rankings.feature           city input, user journeys, validation, response structure
  activity-ranking-behaviour.feature  ranking logic: decision table, metamorphic, pairwise, boundaries
  weather-provider-integration.feature what the service asks Open-Meteo, and its failures
  live-weather-provider.feature       stub fidelity against the real Open-Meteo (npm run test:live)
src/
  steps/                              step definitions by domain; thin: arrange, act, delegate checks
  fixtures/
    scenario-fixtures.ts              fixtures (dependency injection), Given/When/Then, hooks
    scenario-context.ts               per-scenario state ("World") and the "not reachable" error
  clients/
    activity-ranking-api-client.ts    the only code that calls the API; every call is an Allure step
    api-call-outcome.ts               answered / unanswered call types
    live-open-meteo-client.ts         calls the real Open-Meteo for drift checks
  assertions/
    response-assertions.ts            preconditions returning typed bodies (expectRankingReport…)
    ranking-assertions.ts             expectDays: checks every day, reports all failing days at once
  matchers/api-response-matchers.ts   expect.extend: toHaveHttpStatus, toSatisfyContract, toBeProblemResponse
  contract/
    generated/                        types generated from the OpenAPI (npm run contract:types)
    activity-ranking-contract.ts      endpoints, activity names, limits, problem types, service levels
    contract-validator.ts             ajv validation with readable violation paths
  stubs/
    wiremock/                         typed client for the WireMock admin API
    weather-provider/                 Open-Meteo simulator: payload types, place catalogue, weather
                                      conditions and factors, response builders, the stub driver
  reporting/scenario-documentation.ts Allure epic/feature/story/severity/description from the Gherkin
  support/                            calendar dates, Gherkin value tokens ([empty]…), JSON shape diff
  config/test-environment.ts          reads API_BASE_URL, WEATHER_PROVIDER_STUB_URL (.env optional)
scripts/
  generate-pairwise-weather-days.ts   prints the pairwise weeks
  wait-for-weather-provider-stub.ts   container entry: waits for WireMock
  clear-allure-results.ts             empties allure-results before a run
  summarise-acceptance-results.ts     Markdown summary for CI and pull request comments
  ci/                                 publish to / remove from the gh-pages branch
.features-gen/                        tests generated by bddgen from the features (not committed)
allurerc.mjs                          Allure 3 configuration and failure categories
redocly.yaml                          OpenAPI lint rules
playwright.config.ts                  projects (acceptance, live-weather-provider), reporters, timeouts
docker-compose.yml, Dockerfile        WireMock + test runner (+ slot for the service)
.github/workflows/                    CI, report publishing, pull request report cleanup
```
