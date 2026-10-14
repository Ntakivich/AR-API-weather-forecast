import type { AnsweredApiCall, ApiCallOutcome, UnansweredApiCall } from '../clients/api-call-outcome';
import { describeRequest } from '../clients/api-call-outcome';
import type { CataloguedPlace } from '../stubs/weather-provider/place-catalogue';

const PREVIOUS_CALL_POSITION_FROM_END = -2;

export class ActivityRankingApiUnreachableError extends Error {
  constructor(baseUrl: string, unansweredCall: UnansweredApiCall, expectedOutcome: string) {
    const headline = unansweredCall.connectionRefused
      ? `Activity Ranking API is not reachable at ${baseUrl} (${unansweredCall.failureReason}).`
      : `Activity Ranking API did not answer at ${baseUrl} (${unansweredCall.failureReason}).`;
    const explanation = unansweredCall.connectionRefused
      ? 'Spec-first suite: the service is not implemented yet, so this scenario is expected to be red.'
      : 'The service is running but never answered: it should respond, or fail with a problem response.';
    super(
      [
        headline,
        explanation,
        `  Request sent:     ${describeRequest(unansweredCall.request)}`,
        `  Expected outcome: ${expectedOutcome}`,
      ].join('\n'),
    );
    this.name = 'ActivityRankingApiUnreachableError';
  }
}

/**
 * State shared by the steps of one scenario: what was asked, what came back, and which
 * place the scenario is about. A fresh instance is created for every scenario.
 */
export class ScenarioContext {
  /** Text of the step being executed, used to explain what was expected when a call fails. */
  currentStepText = '';
  /** The place the scenario's "Given" steps described the weather for. */
  placeUnderTest: CataloguedPlace | undefined;

  private readonly outcomes: ApiCallOutcome[] = [];

  constructor(private readonly apiBaseUrl: string) {}

  rememberOutcome(outcome: ApiCallOutcome): void {
    this.outcomes.push(outcome);
  }

  /** The most recent answer from the API, or a failure that explains what was expected. */
  latestAnsweredCall(): AnsweredApiCall {
    return this.answeredCall(this.latestOutcome());
  }

  /** Answer to the call made before the latest one, for journeys spanning two requests. */
  previousAnsweredCall(): AnsweredApiCall {
    const previousOutcome = this.outcomes.at(PREVIOUS_CALL_POSITION_FROM_END);
    if (previousOutcome === undefined) {
      throw new Error('Step definition error: the scenario has not made two requests yet.');
    }
    return this.answeredCall(previousOutcome);
  }

  allOutcomes(): readonly ApiCallOutcome[] {
    return this.outcomes;
  }

  requirePlaceUnderTest(): CataloguedPlace {
    if (this.placeUnderTest === undefined) {
      throw new Error('Step definition error: no "Given" step has named the place this scenario is about.');
    }
    return this.placeUnderTest;
  }

  private latestOutcome(): ApiCallOutcome {
    const latestOutcome = this.outcomes.at(-1);
    if (latestOutcome === undefined) {
      throw new Error('Step definition error: no request has been sent to the Activity Ranking API yet.');
    }
    return latestOutcome;
  }

  private answeredCall(outcome: ApiCallOutcome): AnsweredApiCall {
    if (outcome.kind === 'unanswered') {
      throw new ActivityRankingApiUnreachableError(this.apiBaseUrl, outcome, this.currentStepText);
    }
    return outcome;
  }
}
