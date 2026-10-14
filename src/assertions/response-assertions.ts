import type {
  ActivityRankingReport,
  InvalidRequestProblem,
  Location,
  LocationNotFoundProblem,
  LocationSearchResult,
} from '../contract/activity-ranking-contract';
import { PROBLEM_TYPES } from '../contract/activity-ranking-contract';
import type { ScenarioContext } from '../fixtures/scenario-context';
import { expect } from '../matchers/api-response-matchers';
import type { CataloguedPlace } from '../stubs/weather-provider/place-catalogue';
import { findCataloguedPlaceById } from '../stubs/weather-provider/place-catalogue';
import type { WeatherProviderStub } from '../stubs/weather-provider/weather-provider-stub';
import type { RankingEvidence } from './ranking-assertions';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

export class LocationResolutionError extends Error {
  constructor(message: string) {
    super(`Location resolution differs from the specification: ${message}`);
    this.name = 'LocationResolutionError';
  }
}

export class FrontEndExpectationError extends Error {
  constructor(message: string) {
    super(`Front-end expectation not met: ${message}`);
    this.name = 'FrontEndExpectationError';
  }
}

/** A successful, contract-valid ranking report: the precondition of every ranking assertion. */
export function expectRankingReport(scenario: ScenarioContext): ActivityRankingReport {
  const call = scenario.latestAnsweredCall();
  expect(call).toHaveHttpStatus(HTTP_OK);
  expect(call).toSatisfyContract('ActivityRankingReport');
  return call.response.body as ActivityRankingReport;
}

/** The ranking report together with the weather the stub served for that place. */
export function expectRankingEvidence(
  scenario: ScenarioContext,
  weatherProvider: WeatherProviderStub,
): RankingEvidence {
  const report = expectRankingReport(scenario);
  const place = findCataloguedPlaceById(report.location.id);
  return { report, stubbedWeek: place === undefined ? undefined : weatherProvider.forecastWeekFor(place) };
}

export function expectLocationSearchResult(scenario: ScenarioContext): LocationSearchResult {
  const call = scenario.latestAnsweredCall();
  expect(call).toHaveHttpStatus(HTTP_OK);
  expect(call).toSatisfyContract('LocationSearchResult');
  return call.response.body as LocationSearchResult;
}

export function expectInvalidRequestProblem(scenario: ScenarioContext): InvalidRequestProblem {
  const call = scenario.latestAnsweredCall();
  expect(call).toBeProblemResponse(HTTP_BAD_REQUEST, PROBLEM_TYPES.invalidRequest);
  expect(call).toSatisfyContract('InvalidRequestProblem');
  return call.response.body as InvalidRequestProblem;
}

export function expectLocationNotFoundProblem(scenario: ScenarioContext): LocationNotFoundProblem {
  const call = scenario.latestAnsweredCall();
  expect(call).toBeProblemResponse(HTTP_NOT_FOUND, PROBLEM_TYPES.locationNotFound);
  expect(call).toSatisfyContract('LocationNotFoundProblem');
  return call.response.body as LocationNotFoundProblem;
}

export function isSamePlace(location: Location, place: CataloguedPlace): boolean {
  return location.id === place.record.id;
}

export function describeLocation(location: Location): string {
  return `${location.name}, ${location.countryCode} (id ${location.id})`;
}

export function describePlace(place: CataloguedPlace): string {
  return `${place.record.name}, ${place.record.country_code} (id ${place.record.id})`;
}

export function describeLocations(locations: readonly Location[]): string {
  return locations.length === 0 ? '(none)' : locations.map(describeLocation).join('; ');
}
