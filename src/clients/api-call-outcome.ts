export interface ApiRequestDescription {
  method: 'GET';
  path: string;
  queryParameters: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  /** Parsed JSON when the body is JSON, otherwise the raw text. */
  body: unknown;
  durationMilliseconds: number;
}

export interface AnsweredApiCall {
  kind: 'answered';
  request: ApiRequestDescription;
  response: ApiResponse;
}

export interface UnansweredApiCall {
  kind: 'unanswered';
  request: ApiRequestDescription;
  /** True when nothing listens on the base URL, i.e. the service is not running or not built yet. */
  connectionRefused: boolean;
  failureReason: string;
}

export type ApiCallOutcome = AnsweredApiCall | UnansweredApiCall;

export function describeRequest(request: ApiRequestDescription): string {
  const queryString = new URLSearchParams(request.queryParameters).toString();
  return `${request.method} ${request.path}${queryString === '' ? '' : `?${queryString}`}`;
}
