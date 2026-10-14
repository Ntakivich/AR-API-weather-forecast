import type {
  FindRequestsResult,
  LoggedRequest,
  NearMiss,
  NearMissesResult,
  RequestPattern,
  StubMapping,
} from './wiremock-types';

const HTTP_NOT_FOUND = 404;

export class WeatherProviderStubUnreachableError extends Error {
  constructor(stubUrl: string, cause: unknown) {
    super(
      [
        `Weather provider stub (WireMock) is not reachable at ${stubUrl}.`,
        'This is a test-environment problem, not a finding about the Activity Ranking API.',
        'Start the stub with `npm run stubs:start`, or run everything with `npm run test:docker`.',
      ].join('\n'),
      { cause },
    );
    this.name = 'WeatherProviderStubUnreachableError';
  }
}

/** Thin, typed wrapper around the WireMock admin REST API. */
export class WireMockAdminClient {
  constructor(private readonly stubUrl: string) {}

  async resetStubsAndRequestJournal(): Promise<void> {
    await this.send('POST', '/__admin/reset');
  }

  /** Creates the stub, replacing any earlier stub registered under the same id. */
  async upsertStub(stubMapping: StubMapping): Promise<void> {
    await this.send('DELETE', `/__admin/mappings/${stubMapping.id}`, undefined, [HTTP_NOT_FOUND]);
    await this.send('POST', '/__admin/mappings', stubMapping);
  }

  async findReceivedRequests(requestPattern: RequestPattern): Promise<LoggedRequest[]> {
    const result = (await this.send('POST', '/__admin/requests/find', requestPattern)) as FindRequestsResult;
    return result.requests;
  }

  async findUnmatchedRequests(): Promise<LoggedRequest[]> {
    const result = (await this.send('GET', '/__admin/requests/unmatched')) as FindRequestsResult;
    return result.requests;
  }

  async findUnmatchedRequestNearMisses(): Promise<NearMiss[]> {
    const result = (await this.send('GET', '/__admin/requests/unmatched/near-misses')) as NearMissesResult;
    return result.nearMisses;
  }

  private async send(
    method: 'GET' | 'POST' | 'DELETE',
    adminPath: string,
    body?: unknown,
    toleratedStatuses: readonly number[] = [],
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.stubUrl}${adminPath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (networkError) {
      throw new WeatherProviderStubUnreachableError(this.stubUrl, networkError);
    }
    if (!response.ok && !toleratedStatuses.includes(response.status)) {
      throw new Error(
        `WireMock admin call ${method} ${adminPath} failed with ${response.status}: ${await response.text()}`,
      );
    }
    const responseText = await response.text();
    return responseText === '' ? undefined : (JSON.parse(responseText) as unknown);
  }
}
