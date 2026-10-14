import type { ActivityRankingReport } from '../contract/activity-ranking-contract';
import { FORECAST_LENGTH_IN_DAYS } from '../contract/activity-ranking-contract';
import { Given, Then } from '../fixtures/scenario-fixtures';
import type { OpenMeteoEndpointName } from '../stubs/weather-provider/open-meteo-payloads';
import type { CataloguedPlace } from '../stubs/weather-provider/place-catalogue';
import {
  findCataloguedPlace,
  findCataloguedPlaceById,
  normaliseForMatching,
} from '../stubs/weather-provider/place-catalogue';
import type {
  ProviderFailureMode,
  ReceivedProviderRequest,
} from '../stubs/weather-provider/weather-provider-stub';
import { PROVIDER_FAILURE_MODES } from '../stubs/weather-provider/weather-provider-stub';

/** Coordinates may be rounded by the service; a grid cell of Open-Meteo is roughly this size. */
const COORDINATE_TOLERANCE_DEGREES = 0.1;
/** Open-Meteo returns 7 days when `forecast_days` is omitted. */
const OPEN_METEO_DEFAULT_FORECAST_DAYS = 7;
const AUTOMATIC_TIME_ZONE = 'auto';

const PROVIDER_APIS: Record<string, readonly OpenMeteoEndpointName[]> = {
  'forecast API': ['forecast'],
  'marine API': ['marine'],
  'geocoding API': ['geocodingSearch', 'geocodingLookupById'],
};

export class WeatherProviderIntegrationError extends Error {
  constructor(message: string, receivedRequests: readonly ReceivedProviderRequest[]) {
    const requestList =
      receivedRequests.length === 0
        ? '  (none)'
        : receivedRequests.map((request) => `  GET ${request.url}`).join('\n');
    super(
      `Weather provider integration: ${message}\nRequests the stub received on that endpoint:\n${requestList}`,
    );
    this.name = 'WeatherProviderIntegrationError';
  }
}

Given(
  /^the weather provider (forecast API|marine API|geocoding API) answers with (.+)$/,
  async ({ weatherProvider }, providerApi: string, failureText: string) => {
    if (!Object.hasOwn(PROVIDER_FAILURE_MODES, failureText)) {
      throw new Error(
        `Unknown provider failure "${failureText}". Known failures: ${Object.keys(PROVIDER_FAILURE_MODES).join(', ')}.`,
      );
    }
    for (const endpoint of PROVIDER_APIS[providerApi] ?? []) {
      await weatherProvider.failEveryCallTo(endpoint, failureText as ProviderFailureMode);
    }
  },
);

Then(
  'the weather provider received a forecast request for the coordinates of {string}',
  async ({ scenario, weatherProvider }, placeReference: string) => {
    scenario.latestAnsweredCall();
    const place = findCataloguedPlace(placeReference);
    const requests = await weatherProvider.receivedRequests('forecast');
    expectRequestForCoordinatesOf(place, requests, 'forecast');
  },
);

Then(
  'the weather provider received a marine forecast request for the coordinates of {string}',
  async ({ scenario, weatherProvider }, placeReference: string) => {
    scenario.latestAnsweredCall();
    const place = findCataloguedPlace(placeReference);
    const requests = await weatherProvider.receivedRequests('marine');
    expectRequestForCoordinatesOf(place, requests, 'marine forecast');
  },
);

Then(
  "that forecast request covers 7 days of daily data in the place's local time",
  async ({ scenario, weatherProvider }) => {
    const rankedLocation = (scenario.latestAnsweredCall().response.body as Partial<ActivityRankingReport>)
      .location;
    const place = rankedLocation === undefined ? undefined : findCataloguedPlaceById(rankedLocation.id);
    const requests = await weatherProvider.receivedRequests('forecast');
    const problems = requests.flatMap((request) => {
      const forecastDays = Number(request.queryParameters.forecast_days ?? OPEN_METEO_DEFAULT_FORECAST_DAYS);
      const timeZone = request.queryParameters.timezone;
      const findings: string[] = [];
      if (forecastDays !== FORECAST_LENGTH_IN_DAYS) {
        findings.push(`forecast_days is ${forecastDays}, expected ${FORECAST_LENGTH_IN_DAYS}`);
      }
      if (request.queryParameters.daily === undefined || request.queryParameters.daily === '') {
        findings.push('no "daily" variables were requested');
      }
      if (timeZone !== AUTOMATIC_TIME_ZONE && timeZone !== place?.record.timezone) {
        findings.push(
          `timezone is ${JSON.stringify(timeZone)}; daily values must be in local time ` +
            `("${AUTOMATIC_TIME_ZONE}" or "${place?.record.timezone ?? 'the place time zone'}")`,
        );
      }
      return findings;
    });
    if (requests.length === 0 || problems.length > 0) {
      throw new WeatherProviderIntegrationError(
        requests.length === 0
          ? 'no forecast request was sent.'
          : `forecast request is incomplete: ${problems.join('; ')}.`,
        requests,
      );
    }
  },
);

Then(
  'the weather provider received a geocoding search for {string}',
  async ({ scenario, weatherProvider }, cityName: string) => {
    scenario.latestAnsweredCall();
    const requests = await weatherProvider.receivedRequests('geocodingSearch');
    const searchedForCity = requests.some(
      (request) =>
        normaliseForMatching(request.queryParameters.name ?? '') === normaliseForMatching(cityName),
    );
    if (!searchedForCity) {
      throw new WeatherProviderIntegrationError(
        `expected a geocoding search with name="${cityName}".`,
        requests,
      );
    }
  },
);

Then('the weather provider received no forecast requests', async ({ scenario, weatherProvider }) => {
  // Requiring an answer first prevents a false pass when the service never ran at all.
  scenario.latestAnsweredCall();
  const requests = [
    ...(await weatherProvider.receivedRequests('forecast')),
    ...(await weatherProvider.receivedRequests('marine')),
  ];
  if (requests.length > 0) {
    throw new WeatherProviderIntegrationError('a location search must not fetch forecasts.', requests);
  }
});

function expectRequestForCoordinatesOf(
  place: CataloguedPlace,
  requests: readonly ReceivedProviderRequest[],
  requestKind: string,
): void {
  const isNear = (value: string | undefined, expected: number) =>
    value !== undefined && Math.abs(Number(value) - expected) <= COORDINATE_TOLERANCE_DEGREES;
  const matchingRequest = requests.find(
    (request) =>
      isNear(request.queryParameters.latitude, place.record.latitude) &&
      isNear(request.queryParameters.longitude, place.record.longitude),
  );
  if (matchingRequest === undefined) {
    throw new WeatherProviderIntegrationError(
      `expected a ${requestKind} request near latitude ${place.record.latitude}, longitude ${place.record.longitude} ` +
        `(${place.record.name}, ${place.record.country_code}).`,
      requests,
    );
  }
}
