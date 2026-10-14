/**
 * Contract values the scenarios assert against.
 * They mirror contract/activity-ranking-api.openapi.yaml; the types are generated from it,
 * so a renamed activity or rating fails type checking here first.
 */
import type { components } from './generated/activity-ranking-api';

export type ContractSchemas = components['schemas'];
export type ContractSchemaName = keyof ContractSchemas;

export type ActivityName = ContractSchemas['ActivityName'];
export type SuitabilityRating = ContractSchemas['SuitabilityRating'];
export type Location = ContractSchemas['Location'];
export type LocationSearchResult = ContractSchemas['LocationSearchResult'];
export type ActivityAssessment = ContractSchemas['ActivityAssessment'];
export type DailyActivityRanking = ContractSchemas['DailyActivityRanking'];
export type ActivityRankingReport = ContractSchemas['ActivityRankingReport'];
export type ProblemDetails = ContractSchemas['Problem'];
export type ProblemType = ProblemDetails['type'];
export type LocationNotFoundProblem = ContractSchemas['LocationNotFoundProblem'];
export type InvalidRequestProblem = ContractSchemas['InvalidRequestProblem'];

export const API_ENDPOINTS = {
  health: '/health',
  locationSearch: '/v1/locations',
  activityRankings: '/v1/activity-rankings',
} as const;

/** Declaration order is also the documented tie-break order for equal scores. */
export const ACTIVITY_NAMES = [
  'Skiing',
  'Surfing',
  'Outdoor Sightseeing',
  'Indoor Sightseeing',
] as const satisfies readonly ActivityName[];

export const FORECAST_LENGTH_IN_DAYS = 7;

export const SEARCH_QUERY_LENGTH = {
  minimumCharacters: 2,
  prefixMatchingFromCharacters: 3,
  maximumCharacters: 100,
} as const;

export const SEARCH_RESULT_LIMIT = {
  defaultMatches: 10,
  maximumMatches: 20,
} as const;

export const SUITABILITY_SCORE_RANGE = {
  lowest: 0,
  highest: 100,
} as const;

export const PROBLEM_TYPES = {
  invalidRequest: '/problems/invalid-request',
  locationNotFound: '/problems/location-not-found',
  weatherProviderUnavailable: '/problems/weather-provider-unavailable',
  weatherProviderTimeout: '/problems/weather-provider-timeout',
} as const satisfies Record<string, ProblemType>;

export const MEDIA_TYPES = {
  json: 'application/json',
  problemJson: 'application/problem+json',
} as const;

/** Service-level assumptions that keep an autocomplete and a results page responsive. */
export const SERVICE_LEVEL_EXPECTATIONS = {
  /** Upper bound for a single response when Open-Meteo answers promptly. */
  responseTimeBudgetMilliseconds: 2_000,
  /** How long the service waits for Open-Meteo before giving up with 504. */
  weatherProviderTimeoutMilliseconds: 5_000,
  /** Extra allowance on top of the upstream timeout for the service to answer 504. */
  timeoutResponseGraceMilliseconds: 1_500,
} as const;
