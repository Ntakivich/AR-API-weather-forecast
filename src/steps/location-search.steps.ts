import type { DataTable } from 'playwright-bdd';

import {
  FrontEndExpectationError,
  LocationResolutionError,
  describeLocations,
  describePlace,
  expectInvalidRequestProblem,
  expectLocationSearchResult,
  isSamePlace,
} from '../assertions/response-assertions';
import type { Location } from '../contract/activity-ranking-contract';
import type { ScenarioContext } from '../fixtures/scenario-context';
import { Given, Then, When } from '../fixtures/scenario-fixtures';
import type { ActivityRankingApiClient } from '../clients/activity-ranking-api-client';
import type { WeatherProviderStub } from '../stubs/weather-provider/weather-provider-stub';
import { findCataloguedPlace, normaliseForMatching } from '../stubs/weather-provider/place-catalogue';
import { expandTestValue } from '../support/test-values';

interface SearchSteps {
  scenario: ScenarioContext;
  activityRankingApi: ActivityRankingApiClient;
  weatherProvider: WeatherProviderStub;
}

async function searchForLocations(
  { scenario, activityRankingApi, weatherProvider }: SearchSteps,
  query: string,
  limit?: number,
): Promise<void> {
  await weatherProvider.answerPlaceSearch(query);
  scenario.rememberOutcome(await activityRankingApi.searchLocations(query, limit));
}

When(
  'the user searches for locations matching {string}',
  async ({ scenario, activityRankingApi, weatherProvider }, query: string) => {
    await searchForLocations({ scenario, activityRankingApi, weatherProvider }, expandTestValue(query));
  },
);

Given(
  'the user has searched for locations matching {string}',
  async ({ scenario, activityRankingApi, weatherProvider }, query: string) => {
    await searchForLocations({ scenario, activityRankingApi, weatherProvider }, expandTestValue(query));
  },
);

When(
  'the user searches for locations matching a name of {int} characters',
  async ({ scenario, activityRankingApi, weatherProvider }, length: number) => {
    await searchForLocations(
      { scenario, activityRankingApi, weatherProvider },
      expandTestValue(`[${length} letters]`),
    );
  },
);

When(
  'the user searches for locations matching {string} with a limit of {int}',
  async ({ scenario, activityRankingApi, weatherProvider }, query: string, limit: number) => {
    await searchForLocations({ scenario, activityRankingApi, weatherProvider }, query, limit);
  },
);

When('the user searches for locations without a query', async ({ scenario, activityRankingApi }) => {
  scenario.rememberOutcome(await activityRankingApi.searchLocationsWithParameters({}));
});

Then('the search succeeds', ({ scenario }) => {
  expectLocationSearchResult(scenario);
});

Then('the search succeeds with at most {int} matches', ({ scenario }, maximumMatches: number) => {
  const result = expectLocationSearchResult(scenario);
  if (result.matches.length > maximumMatches) {
    throw new FrontEndExpectationError(
      `the limit caps the dropdown at ${maximumMatches} entries, but ${result.matches.length} came back: ` +
        describeLocations(result.matches),
    );
  }
});

Then('the search is rejected as invalid', ({ scenario }) => {
  expectInvalidRequestProblem(scenario);
});

Then('the matches include {string}', ({ scenario }, placeReference: string) => {
  const result = expectLocationSearchResult(scenario);
  expectMatchesToInclude(result.matches, placeReference);
});

Then('{string} is among matches', ({ scenario }, placeReference: string) => {
  const result = expectLocationSearchResult(scenario);
  expectMatchesToInclude(result.matches, placeReference);
});

Then('{string} is not among matches', ({ scenario }, placeReference: string) => {
  const result = expectLocationSearchResult(scenario);
  const place = findCataloguedPlace(placeReference);
  if (result.matches.some((location) => isSamePlace(location, place))) {
    throw new LocationResolutionError(
      `${describePlace(place)} should not be suggested for "${result.query}" ` +
        `(two characters only match an exact name). Matches: ${describeLocations(result.matches)}`,
    );
  }
});

Then('every match has a name starting with {string}', ({ scenario }, prefix: string) => {
  const result = expectLocationSearchResult(scenario);
  const normalisedPrefix = normaliseForMatching(prefix);
  const unrelatedMatches = result.matches.filter(
    (location) => !normaliseForMatching(location.name).startsWith(normalisedPrefix),
  );
  if (unrelatedMatches.length > 0) {
    throw new LocationResolutionError(
      `every suggestion should start with "${prefix}", these do not: ${describeLocations(unrelatedMatches)}`,
    );
  }
});

Then('the search echoes the trimmed query {string}', ({ scenario }, expectedQuery: string) => {
  const result = expectLocationSearchResult(scenario);
  if (result.query !== expectedQuery) {
    throw new FrontEndExpectationError(
      `the response should echo the normalised query "${expectedQuery}", it echoes "${result.query}".`,
    );
  }
});

Then('the matches are, in order:', ({ scenario }, placesTable: DataTable) => {
  const result = expectLocationSearchResult(scenario);
  expectLocationsInOrder(result.matches, placesTable, 'matches');
});

Then('no matches are returned', ({ scenario }) => {
  const result = expectLocationSearchResult(scenario);
  if (result.matches.length > 0) {
    throw new LocationResolutionError(
      `no place should match "${result.query}", but got: ${describeLocations(result.matches)}`,
    );
  }
});

Then('every match has a country, a country code, coordinates and a time zone', ({ scenario }) => {
  const result = expectLocationSearchResult(scenario);
  const incompleteMatches = result.matches.filter(
    (location) =>
      location.country === '' ||
      location.countryCode === '' ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      location.timezone === '',
  );
  if (result.matches.length === 0 || incompleteMatches.length > 0) {
    throw new FrontEndExpectationError(
      `every suggestion needs country, country code, coordinates and time zone to be labelled; ` +
        `incomplete: ${describeLocations(incompleteMatches)} (of ${result.matches.length} matches)`,
    );
  }
});

Then('no two matches share the same name, region and country', ({ scenario }) => {
  const result = expectLocationSearchResult(scenario);
  const labels = result.matches.map(
    (location) => `${location.name} / ${location.region ?? '(no region)'} / ${location.country}`,
  );
  const duplicatedLabels = labels.filter((label, index) => labels.indexOf(label) !== index);
  if (duplicatedLabels.length > 0) {
    throw new FrontEndExpectationError(
      `travellers cannot tell these suggestions apart: ${JSON.stringify([...new Set(duplicatedLabels)])}`,
    );
  }
});

export function expectMatchesToInclude(matches: readonly Location[], placeReference: string): void {
  const place = findCataloguedPlace(placeReference);
  if (!matches.some((location) => isSamePlace(location, place))) {
    throw new LocationResolutionError(
      `${describePlace(place)} should be among the matches, but got: ${describeLocations(matches)}`,
    );
  }
}

export function expectLocationsInOrder(
  locations: readonly Location[],
  placesTable: DataTable,
  listName: string,
): void {
  const expectedPlaces = placesTable.hashes().map((row) => findCataloguedPlace(row.place ?? ''));
  const actualIds = locations.map((location) => location.id);
  const expectedIds = expectedPlaces.map((place) => place.record.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new LocationResolutionError(
      `${listName} should be, most relevant first: ${expectedPlaces.map(describePlace).join('; ')}\n` +
        `  actual ${listName}: ${describeLocations(locations)}`,
    );
  }
}
