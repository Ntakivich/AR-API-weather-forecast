import * as allure from 'allure-js-commons';

import { FORECAST_LENGTH_IN_DAYS, SEARCH_RESULT_LIMIT } from '../contract/activity-ranking-contract';
import type { ForecastWeek } from '../stubs/weather-provider/open-meteo-response-builders';
import {
  forecastResponse,
  geocodingSearchResponse,
  marineResponse,
  simulateGeocodingSearch,
} from '../stubs/weather-provider/open-meteo-response-builders';
import {
  FORECAST_DAILY_VARIABLES,
  MARINE_DAILY_VARIABLES,
  OPEN_METEO_ENDPOINTS,
  OPEN_METEO_LIVE_BASE_URLS,
} from '../stubs/weather-provider/open-meteo-payloads';
import type { CataloguedPlace } from '../stubs/weather-provider/place-catalogue';
import { PLACE_CATALOGUE } from '../stubs/weather-provider/place-catalogue';

const LIVE_REQUEST_TIMEOUT_MILLISECONDS = 15_000;

export type LiveResponseKind = 'geocoding search' | 'geocoding lookup' | 'forecast' | 'marine forecast';

export interface LiveProviderResponse {
  kind: LiveResponseKind;
  url: string;
  status: number;
  body: unknown;
  /** What the stub serves for the same request, when there is a stubbed equivalent. */
  stubbedBody: unknown;
}

export interface CatalogueComparison {
  reference: string;
  differences: string[];
}

/** Calls the real Open-Meteo APIs so the stub can be compared with them. */
export class LiveOpenMeteoClient {
  /** Results of comparing each catalogued place with its live geocoding record. */
  readonly catalogueComparisons: CatalogueComparison[] = [];

  private latestResponse: LiveProviderResponse | undefined;

  get lastResponse(): LiveProviderResponse {
    if (this.latestResponse === undefined) {
      throw new Error('Step definition error: no live Open-Meteo request has been made yet.');
    }
    return this.latestResponse;
  }

  async searchPlaces(name: string): Promise<LiveProviderResponse> {
    const url = new URL(OPEN_METEO_ENDPOINTS.geocodingSearch, OPEN_METEO_LIVE_BASE_URLS.geocoding);
    url.search = new URLSearchParams({
      name,
      count: String(SEARCH_RESULT_LIMIT.defaultMatches),
      language: 'en',
      format: 'json',
    }).toString();
    const stubbedBody = geocodingSearchResponse(simulateGeocodingSearch(name, PLACE_CATALOGUE));
    return this.fetchLive('geocoding search', url, stubbedBody);
  }

  async lookUpPlace(locationId: number): Promise<LiveProviderResponse> {
    const url = new URL(OPEN_METEO_ENDPOINTS.geocodingLookupById, OPEN_METEO_LIVE_BASE_URLS.geocoding);
    url.search = new URLSearchParams({ id: String(locationId) }).toString();
    return this.fetchLive('geocoding lookup', url, undefined);
  }

  async fetchForecast(place: CataloguedPlace, stubbedWeek: ForecastWeek): Promise<LiveProviderResponse> {
    const url = this.dailyDataUrl(
      OPEN_METEO_LIVE_BASE_URLS.forecast,
      OPEN_METEO_ENDPOINTS.forecast,
      place,
      FORECAST_DAILY_VARIABLES,
    );
    return this.fetchLive('forecast', url, forecastResponse(place, stubbedWeek));
  }

  async fetchMarineForecast(
    place: CataloguedPlace,
    stubbedWeek: ForecastWeek,
  ): Promise<LiveProviderResponse> {
    const url = this.dailyDataUrl(
      OPEN_METEO_LIVE_BASE_URLS.marine,
      OPEN_METEO_ENDPOINTS.marine,
      place,
      MARINE_DAILY_VARIABLES,
    );
    return this.fetchLive('marine forecast', url, marineResponse(place, stubbedWeek));
  }

  private dailyDataUrl(
    baseUrl: string,
    endpointPath: string,
    place: CataloguedPlace,
    dailyVariables: readonly string[],
  ): URL {
    const url = new URL(endpointPath, baseUrl);
    url.search = new URLSearchParams({
      latitude: String(place.record.latitude),
      longitude: String(place.record.longitude),
      daily: dailyVariables.join(','),
      timezone: 'auto',
      forecast_days: String(FORECAST_LENGTH_IN_DAYS),
    }).toString();
    return url;
  }

  private async fetchLive(
    kind: LiveResponseKind,
    url: URL,
    stubbedBody: unknown,
  ): Promise<LiveProviderResponse> {
    return allure.step(`GET ${url.toString()}`, async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MILLISECONDS) });
      const body = await response.json();
      await allure.attachment(
        `Live response ${response.status}`,
        JSON.stringify(body, null, 2),
        'application/json',
      );
      if (stubbedBody !== undefined) {
        await allure.attachment(
          'Stubbed equivalent',
          JSON.stringify(stubbedBody, null, 2),
          'application/json',
        );
      }
      this.latestResponse = { kind, url: url.toString(), status: response.status, body, stubbedBody };
      return this.latestResponse;
    });
  }
}
