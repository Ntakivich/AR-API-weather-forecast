import type { APIRequestContext } from '@playwright/test';
import * as allure from 'allure-js-commons';

import { API_ENDPOINTS, SERVICE_LEVEL_EXPECTATIONS } from '../contract/activity-ranking-contract';
import type { ApiCallOutcome, ApiRequestDescription } from './api-call-outcome';
import { describeRequest } from './api-call-outcome';

/** Long enough to observe the service's own 504 after it gives up on a slow weather provider. */
const REQUEST_TIMEOUT_MILLISECONDS =
  SERVICE_LEVEL_EXPECTATIONS.weatherProviderTimeoutMilliseconds +
  SERVICE_LEVEL_EXPECTATIONS.timeoutResponseGraceMilliseconds * 2;

const CONNECTION_REFUSED_SIGNATURES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];

/**
 * The only place that knows how to talk HTTP to the Activity Ranking API.
 * Every call becomes an Allure step with the request and response attached.
 */
export class ActivityRankingApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  checkHealth(): Promise<ApiCallOutcome> {
    return this.get(API_ENDPOINTS.health, {});
  }

  searchLocations(query: string, limit?: number): Promise<ApiCallOutcome> {
    return this.get(API_ENDPOINTS.locationSearch, {
      query,
      ...(limit === undefined ? {} : { limit: String(limit) }),
    });
  }

  /** Sends exactly the given parameters, for scenarios that probe missing or invalid input. */
  searchLocationsWithParameters(queryParameters: Record<string, string>): Promise<ApiCallOutcome> {
    return this.get(API_ENDPOINTS.locationSearch, queryParameters);
  }

  getActivityRankingsForCity(cityName: string): Promise<ApiCallOutcome> {
    return this.get(API_ENDPOINTS.activityRankings, { city: cityName });
  }

  getActivityRankingsForLocationId(locationId: number | string): Promise<ApiCallOutcome> {
    return this.get(API_ENDPOINTS.activityRankings, { locationId: String(locationId) });
  }

  /** Sends exactly the given parameters, for scenarios that probe invalid combinations. */
  getActivityRankingsWithParameters(queryParameters: Record<string, string>): Promise<ApiCallOutcome> {
    return this.get(API_ENDPOINTS.activityRankings, queryParameters);
  }

  private async get(path: string, queryParameters: Record<string, string>): Promise<ApiCallOutcome> {
    const requestDescription: ApiRequestDescription = { method: 'GET', path, queryParameters };
    return allure.step(describeRequest(requestDescription), async () => {
      await allure.attachment(
        'Request',
        JSON.stringify({ baseUrl: this.baseUrl, ...requestDescription }, null, 2),
        'application/json',
      );
      const startedAt = performance.now();
      try {
        const response = await this.request.get(`${this.baseUrl}${path}`, {
          params: queryParameters,
          timeout: REQUEST_TIMEOUT_MILLISECONDS,
          failOnStatusCode: false,
        });
        const durationMilliseconds = Math.round(performance.now() - startedAt);
        const rawBody = await response.text();
        const contentType = response.headers()['content-type'] ?? '';
        const outcome: ApiCallOutcome = {
          kind: 'answered',
          request: requestDescription,
          response: {
            status: response.status(),
            contentType,
            headers: response.headers(),
            body: parseBody(rawBody, contentType),
            durationMilliseconds,
          },
        };
        await allure.attachment(
          `Response ${response.status()} (${durationMilliseconds} ms)`,
          prettyPrint(rawBody, contentType),
          contentType.includes('json') ? 'application/json' : 'text/plain',
        );
        return outcome;
      } catch (networkError) {
        const failureReason = networkError instanceof Error ? networkError.message : String(networkError);
        await allure.attachment('No response', failureReason, 'text/plain');
        return {
          kind: 'unanswered',
          request: requestDescription,
          connectionRefused: CONNECTION_REFUSED_SIGNATURES.some((signature) =>
            failureReason.includes(signature),
          ),
          failureReason: firstLine(failureReason),
        };
      }
    });
  }
}

function parseBody(rawBody: string, contentType: string): unknown {
  if (!contentType.includes('json') || rawBody === '') {
    return rawBody;
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function prettyPrint(rawBody: string, contentType: string): string {
  const parsedBody = parseBody(rawBody, contentType);
  return typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody, null, 2);
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}
