import { FrontEndExpectationError, expectInvalidRequestProblem } from '../assertions/response-assertions';
import type { AnsweredApiCall } from '../clients/api-call-outcome';
import { describeRequest } from '../clients/api-call-outcome';
import type { ProblemType } from '../contract/activity-ranking-contract';
import { MEDIA_TYPES, SERVICE_LEVEL_EXPECTATIONS } from '../contract/activity-ranking-contract';
import { Then } from '../fixtures/scenario-fixtures';
import { expect, previewBody } from '../matchers/api-response-matchers';

const FIRST_SERVER_ERROR_STATUS = 500;
const INTERNAL_DETAIL_PATTERN = /open-meteo|wiremock|localhost|:\d{4}\b|stack|exception|\bat \S+ \(/i;

Then('the request is rejected as invalid', ({ scenario }) => {
  expectInvalidRequestProblem(scenario);
});

Then('the problem names the invalid parameter {string}', ({ scenario }, parameterName: string) => {
  const problem = expectInvalidRequestProblem(scenario);
  const namedParameters = problem.invalidParams.map((invalidParameter) => invalidParameter.name);
  if (!namedParameters.includes(parameterName)) {
    throw new FrontEndExpectationError(
      `the problem should name "${parameterName}" so the form can highlight that field; ` +
        `it names ${JSON.stringify(namedParameters)}.`,
    );
  }
});

Then(
  'the problem names the invalid parameters {string} and {string}',
  ({ scenario }, firstParameterName: string, secondParameterName: string) => {
    const problem = expectInvalidRequestProblem(scenario);
    const namedParameters = problem.invalidParams.map((invalidParameter) => invalidParameter.name);
    const missingNames = [firstParameterName, secondParameterName].filter(
      (parameterName) => !namedParameters.includes(parameterName),
    );
    if (missingNames.length > 0) {
      throw new FrontEndExpectationError(
        `the problem should name both conflicting parameters; it does not name ${JSON.stringify(missingNames)} ` +
          `(named: ${JSON.stringify(namedParameters)}).`,
      );
    }
  },
);

Then(
  'the request fails with status {int} and problem type {string}',
  ({ scenario }, expectedStatus: number, expectedProblemType: string) => {
    expect(scenario.latestAnsweredCall()).toBeProblemResponse(
      expectedStatus,
      expectedProblemType as ProblemType,
    );
  },
);

Then('the problem does not reveal provider URLs or internal error details', ({ scenario }) => {
  const call = scenario.latestAnsweredCall();
  const problemText = JSON.stringify(call.response.body);
  const revealedDetail = INTERNAL_DETAIL_PATTERN.exec(problemText);
  if (revealedDetail !== null) {
    throw new FrontEndExpectationError(
      `problem details are shown to travellers and must not reveal internals; found "${revealedDetail[0]}" in ` +
        previewBody(call.response.body),
    );
  }
});

Then('the response is a handled JSON answer, not a server error', ({ scenario }) => {
  const call = scenario.latestAnsweredCall();
  if (call.response.status >= FIRST_SERVER_ERROR_STATUS) {
    throw new Error(
      `Unexpected HTTP status for ${describeRequest(call.request)}: hostile input must be handled, ` +
        `but the service answered ${call.response.status}: ${previewBody(call.response.body)}`,
    );
  }
  const isJson = [MEDIA_TYPES.json, MEDIA_TYPES.problemJson].some((mediaType) =>
    call.response.contentType.includes(mediaType),
  );
  if (!isJson) {
    throw new FrontEndExpectationError(
      `${describeRequest(call.request)} answered with Content-Type "${call.response.contentType}"; ` +
        'only JSON is safe to render (markup in the input must never come back as HTML).',
    );
  }
});

Then('the response arrives within the response time budget', ({ scenario }) => {
  expectAnsweredWithin(
    scenario.latestAnsweredCall(),
    SERVICE_LEVEL_EXPECTATIONS.responseTimeBudgetMilliseconds,
  );
});

Then('the response arrives within the weather provider timeout plus a grace period', ({ scenario }) => {
  expectAnsweredWithin(
    scenario.latestAnsweredCall(),
    SERVICE_LEVEL_EXPECTATIONS.weatherProviderTimeoutMilliseconds +
      SERVICE_LEVEL_EXPECTATIONS.timeoutResponseGraceMilliseconds,
  );
});

function expectAnsweredWithin(call: AnsweredApiCall, budgetMilliseconds: number): void {
  if (call.response.durationMilliseconds > budgetMilliseconds) {
    throw new FrontEndExpectationError(
      `${describeRequest(call.request)} took ${call.response.durationMilliseconds} ms; ` +
        `the budget is ${budgetMilliseconds} ms.`,
    );
  }
}
