import * as allure from 'allure-js-commons';

import { FORECAST_LENGTH_IN_DAYS } from '../contract/activity-ranking-contract';
import { Then, When } from '../fixtures/scenario-fixtures';
import type { OpenMeteoPlace } from '../stubs/weather-provider/open-meteo-payloads';
import { MARINE_DAILY_VARIABLES } from '../stubs/weather-provider/open-meteo-payloads';
import { PLACE_CATALOGUE, findCataloguedPlace } from '../stubs/weather-provider/place-catalogue';
import { consecutiveDates, todayInTimeZone } from '../support/calendar';
import { compareShapes, describeJsonShape } from '../support/json-shape';

const HTTP_OK = 200;

/** Coordinates in GeoNames are occasionally refined; anything within ~1 km is the same place. */
const COORDINATE_TOLERANCE_DEGREES = 0.01;

class StubDriftError extends Error {
  constructor(message: string) {
    super(`Stub drift: ${message}`);
    this.name = 'StubDriftError';
  }
}

When('the live geocoding API is searched for {string}', async ({ liveWeatherProvider }, name: string) => {
  await liveWeatherProvider.searchPlaces(name);
});

When(
  'the live geocoding API is asked for location id {int}',
  async ({ liveWeatherProvider }, locationId: number) => {
    await liveWeatherProvider.lookUpPlace(locationId);
  },
);

When(
  'the live forecast API is asked for 7 days of daily weather in {string}',
  async ({ liveWeatherProvider, weatherProvider }, placeReference: string) => {
    const place = findCataloguedPlace(placeReference);
    await liveWeatherProvider.fetchForecast(place, weatherProvider.forecastWeekFor(place));
  },
);

When(
  'the live marine API is asked for 7 days of wave data in {string}',
  async ({ liveWeatherProvider, weatherProvider }, placeReference: string) => {
    const place = findCataloguedPlace(placeReference);
    await liveWeatherProvider.fetchMarineForecast(place, weatherProvider.forecastWeekFor(place));
  },
);

When(
  'each catalogued place is looked up by id in the live geocoding API',
  async ({ liveWeatherProvider }) => {
    for (const place of PLACE_CATALOGUE) {
      const liveResponse = await liveWeatherProvider.lookUpPlace(place.record.id);
      liveWeatherProvider.catalogueComparisons.push({
        reference: `${place.record.name}, ${place.record.country_code} (id ${place.record.id})`,
        differences:
          liveResponse.status === HTTP_OK
            ? compareCataloguedRecord(place.record, liveResponse.body as OpenMeteoPlace)
            : [`live lookup answered ${liveResponse.status}`],
      });
    }
  },
);

Then(
  /^every field the stub serves for a (geocoding search|forecast|marine forecast) exists in the live response with the same type$/,
  async ({ liveWeatherProvider }, responseKind: string) => {
    const liveResponse = liveWeatherProvider.lastResponse;
    if (liveResponse.kind !== responseKind) {
      throw new Error(
        `Step definition error: the last live request was a ${liveResponse.kind}, not a ${responseKind}.`,
      );
    }
    const difference = compareShapes(
      describeJsonShape(liveResponse.body),
      describeJsonShape(liveResponse.stubbedBody),
    );
    if (difference.onlyInLive.length > 0) {
      await allure.attachment(
        'Live-only fields (informational: the stub serves a subset)',
        difference.onlyInLive.join('\n'),
        'text/plain',
      );
    }
    if (difference.onlyInStub.length > 0) {
      throw new StubDriftError(
        `the stubbed ${responseKind} serves fields that the live API no longer returns with that type:\n` +
          difference.onlyInStub.map((entry) => `  • ${entry}`).join('\n') +
          `\nLive request: GET ${liveResponse.url}`,
      );
    }
  },
);

Then('the live response has no {string} field', ({ liveWeatherProvider }, fieldName: string) => {
  const body = liveWeatherProvider.lastResponse.body as Record<string, unknown>;
  if (Object.hasOwn(body, fieldName)) {
    throw new StubDriftError(
      `the live API now returns "${fieldName}" (${JSON.stringify(body[fieldName])}) where the stub omits it.`,
    );
  }
});

Then(
  'the live forecast covers 7 consecutive days starting today in {string}',
  ({ liveWeatherProvider }, timeZone: string) => {
    const body = liveWeatherProvider.lastResponse.body as { daily?: { time?: string[] } };
    const liveDates = body.daily?.time ?? [];
    const expectedDates = consecutiveDates(todayInTimeZone(timeZone), FORECAST_LENGTH_IN_DAYS);
    if (JSON.stringify(liveDates) !== JSON.stringify(expectedDates)) {
      throw new StubDriftError(
        `the stub serves ${expectedDates.join(', ')} but the live API returned ${liveDates.join(', ')}.`,
      );
    }
  },
);

Then('every live wave value is missing', ({ liveWeatherProvider }) => {
  const body = liveWeatherProvider.lastResponse.body as { daily?: Record<string, unknown[]> };
  const presentValues = MARINE_DAILY_VARIABLES.flatMap((variable) =>
    (body.daily?.[variable] ?? [])
      .filter((value) => value !== null)
      .map((value) => `${variable}=${JSON.stringify(value)}`),
  );
  if (presentValues.length > 0) {
    throw new StubDriftError(
      `the stub serves null wave values inland, but the live API returned ${presentValues.join(', ')}.`,
    );
  }
});

Then(
  'the live response has status {int} and reason {string}',
  ({ liveWeatherProvider }, expectedStatus: number, expectedReason: string) => {
    const liveResponse = liveWeatherProvider.lastResponse;
    const reason = (liveResponse.body as { reason?: unknown }).reason;
    if (liveResponse.status !== expectedStatus || reason !== expectedReason) {
      throw new StubDriftError(
        `the stub answers ${expectedStatus} "${expectedReason}", the live API answered ` +
          `${liveResponse.status} ${JSON.stringify(reason)}.`,
      );
    }
  },
);

Then('every catalogued place matches its live record', ({ liveWeatherProvider }) => {
  const drifted = liveWeatherProvider.catalogueComparisons.filter(
    (comparison) => comparison.differences.length > 0,
  );
  if (drifted.length > 0) {
    throw new StubDriftError(
      `catalogued places differ from live geocoding records:\n` +
        drifted
          .map((comparison) => `  • ${comparison.reference}: ${comparison.differences.join('; ')}`)
          .join('\n'),
    );
  }
});

function compareCataloguedRecord(catalogued: OpenMeteoPlace, live: OpenMeteoPlace): string[] {
  const differences: string[] = [];
  for (const field of ['name', 'country_code', 'timezone'] as const) {
    if (catalogued[field] !== live[field]) {
      differences.push(`${field} "${catalogued[field]}" is now "${live[field]}"`);
    }
  }
  for (const field of ['latitude', 'longitude'] as const) {
    if (Math.abs(catalogued[field] - live[field]) > COORDINATE_TOLERANCE_DEGREES) {
      differences.push(`${field} ${catalogued[field]} is now ${live[field]}`);
    }
  }
  return differences;
}
