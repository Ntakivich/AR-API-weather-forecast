import { randomUUID } from 'node:crypto';

import {
  FORECAST_LENGTH_IN_DAYS,
  SERVICE_LEVEL_EXPECTATIONS,
} from '../../contract/activity-ranking-contract';
import { consecutiveDates, todayInTimeZone } from '../../support/calendar';
import type { WireMockAdminClient } from '../wiremock/wiremock-admin-client';
import type { LoggedRequest, ResponseDefinition, StubMapping } from '../wiremock/wiremock-types';
import type { DailyWeather } from './daily-weather';
import { UNREMARKABLE_WEATHER_CONDITION, weatherCondition } from './daily-weather';
import type { OpenMeteoEndpointName } from './open-meteo-payloads';
import { OPEN_METEO_ENDPOINTS } from './open-meteo-payloads';
import type { ForecastWeek } from './open-meteo-response-builders';
import {
  forecastResponse,
  geocodingSearchResponse,
  marineResponse,
  providerErrorResponse,
  simulateGeocodingSearch,
} from './open-meteo-response-builders';
import type { CataloguedPlace } from './place-catalogue';
import { findCataloguedPlaceById, PLACE_CATALOGUE, placesNamedExactly } from './place-catalogue';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** Lower wins in WireMock: injected failures must override the scenario's normal stubs. */
const FAILURE_STUB_PRIORITY = 1;
const SCENARIO_STUB_PRIORITY = 5;

/** How far beyond the service's own upstream timeout a "slow" provider takes to answer. */
const SLOW_RESPONSE_OVERSHOOT_MILLISECONDS = 3_000;

/** The service may round coordinates, so forecast stubs accept anything within one degree. */
const COORDINATE_TOLERANCE_IN_WHOLE_DEGREES = 1;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export const PROVIDER_FAILURE_MODES = {
  'an internal server error': {
    status: HTTP_INTERNAL_SERVER_ERROR,
    headers: JSON_HEADERS,
    jsonBody: providerErrorResponse('Internal Server Error'),
  },
  'a service unavailable page': {
    status: HTTP_SERVICE_UNAVAILABLE,
    headers: { 'Content-Type': 'text/html' },
    body: '<html><body><h1>503 Service Temporarily Unavailable</h1></body></html>',
  },
  'a malformed JSON body': {
    status: HTTP_OK,
    headers: JSON_HEADERS,
    body: '{"daily": {"time": ["2026-',
  },
  'an unexpected JSON shape': {
    status: HTTP_OK,
    headers: JSON_HEADERS,
    jsonBody: { message: 'This payload does not follow the Open-Meteo schema' },
  },
  'a response slower than the service timeout': {
    status: HTTP_OK,
    headers: JSON_HEADERS,
    jsonBody: { generationtime_ms: 0 },
    fixedDelayMilliseconds:
      SERVICE_LEVEL_EXPECTATIONS.weatherProviderTimeoutMilliseconds + SLOW_RESPONSE_OVERSHOOT_MILLISECONDS,
  },
  'a dropped connection': {
    fault: 'CONNECTION_RESET_BY_PEER',
  },
} as const satisfies Record<string, ResponseDefinition>;

export type ProviderFailureMode = keyof typeof PROVIDER_FAILURE_MODES;

export interface ReceivedProviderRequest {
  endpoint: OpenMeteoEndpointName;
  url: string;
  queryParameters: Record<string, string>;
}

/**
 * Drives WireMock so that, to the service under test, it behaves like Open-Meteo for a
 * scenario-controlled world: which places exist, what the weather is, and how the provider fails.
 */
export class WeatherProviderStub {
  private readonly weeklyWeatherByPlaceId = new Map<number, (DailyWeather | null)[]>();
  private readonly stubIdsByPurpose = new Map<string, string>();

  constructor(private readonly wireMock: WireMockAdminClient) {}

  async resetToKnownState(): Promise<void> {
    this.weeklyWeatherByPlaceId.clear();
    this.stubIdsByPurpose.clear();
    await this.wireMock.resetStubsAndRequestJournal();
  }

  setWeatherForWholeWeek(place: CataloguedPlace, weather: DailyWeather): void {
    this.weeklyWeatherByPlaceId.set(
      place.record.id,
      Array.from({ length: FORECAST_LENGTH_IN_DAYS }, () => ({ ...weather })),
    );
  }

  /** @param dayNumber 1 = today at the place, 7 = the last forecast day. */
  setWeatherOnDay(place: CataloguedPlace, dayNumber: number, weather: DailyWeather | null): void {
    const week = this.weeklyWeatherFor(place);
    week[dayNumber - 1] = weather;
    this.weeklyWeatherByPlaceId.set(place.record.id, week);
  }

  forecastWeekFor(place: CataloguedPlace): ForecastWeek {
    return {
      dates: consecutiveDates(todayInTimeZone(place.record.timezone), FORECAST_LENGTH_IN_DAYS),
      days: this.weeklyWeatherFor(place),
    };
  }

  /** Answers a location search exactly as Open-Meteo would for the simulated place catalogue. */
  async answerPlaceSearch(query: string): Promise<CataloguedPlace[]> {
    const matches = simulateGeocodingSearch(query, PLACE_CATALOGUE);
    await this.upsertStub(`geocoding search for "${query.trim()}"`, SCENARIO_STUB_PRIORITY, {
      request: {
        method: 'GET',
        urlPath: OPEN_METEO_ENDPOINTS.geocodingSearch,
        queryParameters: { name: { matches: `(?iu)^\\s*${escapeForRegex(query.trim())}\\s*$` } },
      },
      response: { status: HTTP_OK, headers: JSON_HEADERS, jsonBody: geocodingSearchResponse(matches) },
    });
    return matches;
  }

  /** Prepares everything the service needs to rank activities for a city name. */
  async prepareForCityRequest(cityName: string): Promise<void> {
    await this.answerPlaceSearch(cityName);
    for (const place of placesNamedExactly(cityName)) {
      await this.publishWeatherFor(place);
    }
  }

  /** Prepares a lookup by identifier; unknown identifiers get Open-Meteo's real 400 answer. */
  async prepareForLocationIdRequest(locationId: number): Promise<void> {
    const place = findCataloguedPlaceById(locationId);
    await this.upsertStub(`geocoding lookup of id ${locationId}`, SCENARIO_STUB_PRIORITY, {
      request: {
        method: 'GET',
        urlPath: OPEN_METEO_ENDPOINTS.geocodingLookupById,
        queryParameters: { id: { equalTo: String(locationId) } },
      },
      response:
        place === undefined
          ? {
              status: HTTP_BAD_REQUEST,
              headers: JSON_HEADERS,
              jsonBody: providerErrorResponse('Location ID not found.'),
            }
          : { status: HTTP_OK, headers: JSON_HEADERS, jsonBody: place.record },
    });
    if (place !== undefined) {
      await this.publishWeatherFor(place);
    }
  }

  async publishWeatherFor(place: CataloguedPlace): Promise<void> {
    const week = this.forecastWeekFor(place);
    const coordinateMatchers = {
      latitude: { matches: coordinatePattern(place.record.latitude) },
      longitude: { matches: coordinatePattern(place.record.longitude) },
    };
    await this.upsertStub(`forecast for place ${place.record.id}`, SCENARIO_STUB_PRIORITY, {
      request: { method: 'GET', urlPath: OPEN_METEO_ENDPOINTS.forecast, queryParameters: coordinateMatchers },
      response: { status: HTTP_OK, headers: JSON_HEADERS, jsonBody: forecastResponse(place, week) },
    });
    await this.upsertStub(`marine forecast for place ${place.record.id}`, SCENARIO_STUB_PRIORITY, {
      request: { method: 'GET', urlPath: OPEN_METEO_ENDPOINTS.marine, queryParameters: coordinateMatchers },
      response: { status: HTTP_OK, headers: JSON_HEADERS, jsonBody: marineResponse(place, week) },
    });
  }

  async failEveryCallTo(endpoint: OpenMeteoEndpointName, failureMode: ProviderFailureMode): Promise<void> {
    await this.upsertStub(`failure of ${endpoint}: ${failureMode}`, FAILURE_STUB_PRIORITY, {
      request: { method: 'GET', urlPath: OPEN_METEO_ENDPOINTS[endpoint] },
      response: PROVIDER_FAILURE_MODES[failureMode],
    });
  }

  async receivedRequests(endpoint: OpenMeteoEndpointName): Promise<ReceivedProviderRequest[]> {
    const loggedRequests = await this.wireMock.findReceivedRequests({
      method: 'GET',
      urlPath: OPEN_METEO_ENDPOINTS[endpoint],
    });
    return loggedRequests.map((loggedRequest) => toReceivedProviderRequest(endpoint, loggedRequest));
  }

  /** Requests the service sent that no stub answered: the first thing to read when a scenario fails. */
  async describeUnansweredRequests(): Promise<string[]> {
    const unmatchedRequests = await this.wireMock.findUnmatchedRequests();
    return unmatchedRequests.map((loggedRequest) => `${loggedRequest.method} ${loggedRequest.url}`);
  }

  private weeklyWeatherFor(place: CataloguedPlace): (DailyWeather | null)[] {
    return (
      this.weeklyWeatherByPlaceId.get(place.record.id) ??
      Array.from({ length: FORECAST_LENGTH_IN_DAYS }, () => weatherCondition(UNREMARKABLE_WEATHER_CONDITION))
    );
  }

  private async upsertStub(
    purpose: string,
    priority: number,
    definition: Pick<StubMapping, 'request' | 'response'>,
  ): Promise<void> {
    const stubId = this.stubIdsByPurpose.get(purpose) ?? randomUUID();
    this.stubIdsByPurpose.set(purpose, stubId);
    await this.wireMock.upsertStub({ id: stubId, name: purpose, priority, ...definition });
  }
}

function toReceivedProviderRequest(
  endpoint: OpenMeteoEndpointName,
  loggedRequest: LoggedRequest,
): ReceivedProviderRequest {
  const queryParameters = Object.fromEntries(
    Object.values(loggedRequest.queryParams ?? {}).map((parameter) => [
      parameter.key,
      parameter.values.join(','),
    ]),
  );
  return { endpoint, url: loggedRequest.url, queryParameters };
}

/** Accepts the coordinate written with any precision, within a whole degree either side. */
function coordinatePattern(coordinate: number): string {
  const wholeDegrees = Math.trunc(coordinate);
  const acceptedWholeDegrees = new Set<string>();
  for (
    let candidate = wholeDegrees - COORDINATE_TOLERANCE_IN_WHOLE_DEGREES;
    candidate <= wholeDegrees + COORDINATE_TOLERANCE_IN_WHOLE_DEGREES;
    candidate += 1
  ) {
    acceptedWholeDegrees.add(String(candidate));
  }
  if (Math.abs(coordinate) < COORDINATE_TOLERANCE_IN_WHOLE_DEGREES) {
    acceptedWholeDegrees.add('-0');
  }
  return `^(?:${[...acceptedWholeDegrees].join('|')})(?:\\.\\d+)?$`;
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
