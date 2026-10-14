import type { DataTable } from 'playwright-bdd';

import { expectDays } from '../assertions/ranking-assertions';
import {
  FrontEndExpectationError,
  LocationResolutionError,
  describeLocation,
  describeLocations,
  describePlace,
  expectLocationNotFoundProblem,
  expectLocationSearchResult,
  expectRankingEvidence,
  expectRankingReport,
  isSamePlace,
} from '../assertions/response-assertions';
import type { ActivityRankingApiClient } from '../clients/activity-ranking-api-client';
import type { Location, SuitabilityRating } from '../contract/activity-ranking-contract';
import { ACTIVITY_NAMES, FORECAST_LENGTH_IN_DAYS } from '../contract/activity-ranking-contract';
import type { ScenarioContext } from '../fixtures/scenario-context';
import { Given, Then, When } from '../fixtures/scenario-fixtures';
import { expect } from '../matchers/api-response-matchers';
import { findCataloguedPlace } from '../stubs/weather-provider/place-catalogue';
import type { WeatherProviderStub } from '../stubs/weather-provider/weather-provider-stub';
import { consecutiveDates, todayInTimeZone } from '../support/calendar';
import { parseQueryParameters } from '../support/test-values';
import { expectLocationsInOrder, expectMatchesToInclude } from './location-search.steps';

const RAW_PROVIDER_DETAIL_PATTERN =
  /\bWMO\b|weather_code|snowfall_sum|precipitation_sum|_max\b|_min\b|\bnull\b|\bundefined\b|\bNaN\b|\[object/i;
const SNOWFALL_IN_CENTIMETRES_PATTERN = /\d+(?:[.,]\d+)?\s?cm\b/i;

interface RankingSteps {
  scenario: ScenarioContext;
  activityRankingApi: ActivityRankingApiClient;
  weatherProvider: WeatherProviderStub;
}

async function requestRankingsForCity(
  { scenario, activityRankingApi, weatherProvider }: RankingSteps,
  cityName: string,
): Promise<void> {
  await weatherProvider.prepareForCityRequest(cityName);
  scenario.rememberOutcome(await activityRankingApi.getActivityRankingsForCity(cityName));
}

async function requestRankingsForLocationId(
  { scenario, activityRankingApi, weatherProvider }: RankingSteps,
  locationId: number,
): Promise<void> {
  await weatherProvider.prepareForLocationIdRequest(locationId);
  scenario.rememberOutcome(await activityRankingApi.getActivityRankingsForLocationId(locationId));
}

When(
  'the user requests activity rankings for {string}',
  async ({ scenario, activityRankingApi, weatherProvider }, cityName: string) => {
    await requestRankingsForCity({ scenario, activityRankingApi, weatherProvider }, cityName);
  },
);

Given(
  'the user has requested activity rankings for {string}',
  async ({ scenario, activityRankingApi, weatherProvider }, cityName: string) => {
    await requestRankingsForCity({ scenario, activityRankingApi, weatherProvider }, cityName);
  },
);

When(
  'the user requests activity rankings for location id {int}',
  async ({ scenario, activityRankingApi, weatherProvider }, locationId: number) => {
    await requestRankingsForLocationId({ scenario, activityRankingApi, weatherProvider }, locationId);
  },
);

When(
  'the user requests activity rankings with {}',
  async ({ scenario, activityRankingApi, weatherProvider }, parameterSpecification: string) => {
    const queryParameters = parseQueryParameters(parameterSpecification);
    if (queryParameters.city !== undefined) {
      await weatherProvider.prepareForCityRequest(queryParameters.city);
    }
    scenario.rememberOutcome(await activityRankingApi.getActivityRankingsWithParameters(queryParameters));
  },
);

When(
  'the user picks {string} from the matches',
  async ({ scenario, activityRankingApi, weatherProvider }, placeReference: string) => {
    const result = expectLocationSearchResult(scenario);
    const pickedLocation = pickLocation(result.matches, placeReference, 'search matches');
    await requestRankingsForLocationId({ scenario, activityRankingApi, weatherProvider }, pickedLocation.id);
  },
);

When(
  'the user picks the alternative match {string}',
  async ({ scenario, activityRankingApi, weatherProvider }, placeReference: string) => {
    const report = expectRankingReport(scenario);
    const pickedLocation = pickLocation(report.alternativeMatches, placeReference, 'alternative matches');
    await requestRankingsForLocationId({ scenario, activityRankingApi, weatherProvider }, pickedLocation.id);
  },
);

Then('the rankings are returned for {string}', ({ scenario }, placeReference: string) => {
  expectRankingsFor(scenario, placeReference);
});

Given('the rankings were returned for {string}', ({ scenario }, placeReference: string) => {
  expectRankingsFor(scenario, placeReference);
});

Then('the response satisfies the activity ranking contract', ({ scenario }) => {
  expectRankingReport(scenario);
});

Then('the alternative matches are, in order:', ({ scenario }, placesTable: DataTable) => {
  const report = expectRankingReport(scenario);
  expectLocationsInOrder(report.alternativeMatches, placesTable, 'alternative matches');
});

Then('there are no alternative matches', ({ scenario }) => {
  const report = expectRankingReport(scenario);
  if (report.alternativeMatches.length > 0) {
    throw new LocationResolutionError(
      `a place chosen by id is unambiguous, yet alternatives were listed: ${describeLocations(report.alternativeMatches)}`,
    );
  }
});

Then('the location is reported as not found', ({ scenario }) => {
  expectLocationNotFoundProblem(scenario);
});

Then('the suggestions include {string}', ({ scenario }, placeReference: string) => {
  const problem = expectLocationNotFoundProblem(scenario);
  expectMatchesToInclude(problem.suggestions, placeReference);
});

Then('there are no suggestions', ({ scenario }) => {
  const problem = expectLocationNotFoundProblem(scenario);
  if (problem.suggestions.length > 0) {
    throw new LocationResolutionError(
      `no place resembles the name, yet suggestions were listed: ${describeLocations(problem.suggestions)}`,
    );
  }
});

Then(
  'the rankings cover {int} consecutive days starting today in {string}',
  ({ scenario }, numberOfDays: number, timeZone: string) => {
    const report = expectRankingReport(scenario);
    const expectedDates = consecutiveDates(todayInTimeZone(timeZone), numberOfDays);
    const actualDates = report.days.map((day) => day.date);
    if (JSON.stringify(actualDates) !== JSON.stringify(expectedDates)) {
      throw new FrontEndExpectationError(
        `the week should start today in ${timeZone} and run for ${numberOfDays} consecutive days.\n` +
          `  expected dates: ${expectedDates.join(', ')}\n  actual dates:   ${actualDates.join(', ')}`,
      );
    }
  },
);

Then(
  'every day lists Skiing, Surfing, Outdoor Sightseeing and Indoor Sightseeing exactly once',
  ({ scenario, weatherProvider }) => {
    const evidence = expectRankingEvidence(scenario, weatherProvider);
    expectDays(evidence, 'every day lists each of the four activities exactly once', ({ day }) => {
      const listedActivities = day.activities.map((assessment) => assessment.activity).sort();
      const expectedActivities = [...ACTIVITY_NAMES].sort();
      return JSON.stringify(listedActivities) === JSON.stringify(expectedActivities)
        ? undefined
        : `lists ${JSON.stringify(listedActivities)}`;
    });
  },
);

Then("every day's activities are ordered by rank from 1 to 4", ({ scenario, weatherProvider }) => {
  const evidence = expectRankingEvidence(scenario, weatherProvider);
  expectDays(evidence, 'activities are listed in rank order 1, 2, 3, 4', ({ day }) => {
    const ranks = day.activities.map((assessment) => assessment.rank);
    const expectedRanks = ACTIVITY_NAMES.map((_activity, index) => index + 1);
    return JSON.stringify(ranks) === JSON.stringify(expectedRanks)
      ? undefined
      : `ranks in listed order are ${JSON.stringify(ranks)}`;
  });
});

Then(
  'every suitability rating matches the band of its score:',
  ({ scenario, weatherProvider }, bandsTable: DataTable) => {
    const evidence = expectRankingEvidence(scenario, weatherProvider);
    const bands = bandsTable.hashes().map((row) => ({
      rating: row.rating as SuitabilityRating,
      lowestScore: Number(row['lowest score']),
      highestScore: Number(row['highest score']),
    }));
    expectDays(evidence, 'each rating is the band its score falls into', ({ day }) => {
      const mismatches = day.activities.flatMap((assessment) => {
        if (assessment.suitabilityRating === 'UNAVAILABLE') {
          return [];
        }
        const score = assessment.suitabilityScore;
        const band = bands.find((candidate) => candidate.rating === assessment.suitabilityRating);
        const isInBand =
          band !== undefined && score !== null && score >= band.lowestScore && score <= band.highestScore;
        return isInBand
          ? []
          : [`${assessment.activity} scores ${score} but is rated ${assessment.suitabilityRating}`];
      });
      return mismatches.length === 0 ? undefined : mismatches.join('; ');
    });
  },
);

Then('every activity has at least one reason', ({ scenario, weatherProvider }) => {
  const evidence = expectRankingEvidence(scenario, weatherProvider);
  expectDays(evidence, 'every activity explains its assessment', ({ day }) => {
    const unexplained = day.activities.filter((assessment) =>
      assessment.reasons.every((reason) => reason.trim() === ''),
    );
    return unexplained.length === 0
      ? undefined
      : `no reason given for ${unexplained.map((assessment) => assessment.activity).join(', ')}`;
  });
});

Then('no reason exposes provider codes, field names or missing values', ({ scenario, weatherProvider }) => {
  const evidence = expectRankingEvidence(scenario, weatherProvider);
  expectDays(evidence, 'reasons are plain language a traveller can read', ({ day }) => {
    const technicalReasons = day.activities
      .flatMap((assessment) => assessment.reasons)
      .filter((reason) => RAW_PROVIDER_DETAIL_PATTERN.test(reason));
    return technicalReasons.length === 0
      ? undefined
      : `technical reasons: ${JSON.stringify(technicalReasons)}`;
  });
});

Then(
  'the reasons for {string} mention the snowfall in centimetres',
  ({ scenario, weatherProvider }, activityText: string) => {
    const evidence = expectRankingEvidence(scenario, weatherProvider);
    expectDays(
      evidence,
      `the reasons for ${activityText} quote the snowfall with its unit (e.g. "30 cm")`,
      ({ day }) => {
        const reasons =
          day.activities.find((assessment) => assessment.activity === activityText)?.reasons ?? [];
        return reasons.some((reason) => SNOWFALL_IN_CENTIMETRES_PATTERN.test(reason))
          ? undefined
          : `reasons are ${JSON.stringify(reasons)}`;
      },
    );
  },
);

function expectRankingsFor(scenario: ScenarioContext, placeReference: string): void {
  const report = expectRankingReport(scenario);
  const expectedPlace = findCataloguedPlace(placeReference);
  if (!isSamePlace(report.location, expectedPlace)) {
    throw new LocationResolutionError(
      `rankings should be for ${describePlace(expectedPlace)}, but are for ${describeLocation(report.location)}`,
    );
  }
  expect(
    report.days,
    `Contract violation: the report must cover ${FORECAST_LENGTH_IN_DAYS} days`,
  ).toHaveLength(FORECAST_LENGTH_IN_DAYS);
}

function pickLocation(locations: readonly Location[], placeReference: string, listName: string): Location {
  const place = findCataloguedPlace(placeReference);
  const location = locations.find((candidate) => isSamePlace(candidate, place));
  if (location === undefined) {
    throw new LocationResolutionError(
      `the user cannot pick ${describePlace(place)}: it is not among the ${listName} (${describeLocations(locations)})`,
    );
  }
  return location;
}
