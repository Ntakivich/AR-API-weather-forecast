/** Subset of the WireMock 3 admin API model used by this suite. */

export interface StringValuePattern {
  equalTo?: string;
  caseInsensitive?: boolean;
  matches?: string;
}

export interface RequestPattern {
  method: 'GET' | 'POST' | 'ANY';
  urlPath: string;
  queryParameters?: Record<string, StringValuePattern>;
}

export type ConnectionFault = 'CONNECTION_RESET_BY_PEER' | 'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE_CHUNK';

export interface ResponseDefinition {
  status?: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  body?: string;
  fixedDelayMilliseconds?: number;
  fault?: ConnectionFault;
}

export interface StubMapping {
  id: string;
  name: string;
  /** Lower number wins when several stubs match the same request. */
  priority: number;
  request: RequestPattern;
  response: ResponseDefinition;
}

export interface LoggedRequest {
  method: string;
  url: string;
  absoluteUrl: string;
  loggedDate: number;
  queryParams?: Record<string, { key: string; values: string[] }>;
}

export interface FindRequestsResult {
  requests: LoggedRequest[];
}

export interface NearMiss {
  request: LoggedRequest;
  stubMapping?: StubMapping;
  matchResult: { distance: number };
}

export interface NearMissesResult {
  nearMisses: NearMiss[];
}
