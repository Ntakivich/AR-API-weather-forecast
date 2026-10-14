import { expect as baseExpect } from '@playwright/test';

import type { AnsweredApiCall } from '../clients/api-call-outcome';
import { describeRequest } from '../clients/api-call-outcome';
import type { ContractSchemaName, ProblemType } from '../contract/activity-ranking-contract';
import { MEDIA_TYPES } from '../contract/activity-ranking-contract';
import { contractValidator, formatViolations } from '../contract/contract-validator';

const MAXIMUM_BODY_PREVIEW_LENGTH = 600;

interface MatcherResult {
  pass: boolean;
  message: () => string;
  name: string;
}

/**
 * Domain-specific matchers for answered API calls. Failure messages start with a stable
 * prefix ("Unexpected HTTP status", "Contract violation", ...) that the Allure failure
 * categories use to group failures by cause.
 */
export const expect = baseExpect.extend({
  toHaveHttpStatus(call: AnsweredApiCall, expectedStatus: number): MatcherResult {
    const pass = call.response.status === expectedStatus;
    return {
      name: 'toHaveHttpStatus',
      pass,
      message: () =>
        [
          `Unexpected HTTP status for ${describeRequest(call.request)}:`,
          `  expected ${this.isNot ? 'anything but ' : ''}${expectedStatus}, received ${call.response.status}`,
          `  response body: ${previewBody(call.response.body)}`,
        ].join('\n'),
    };
  },

  toSatisfyContract(call: AnsweredApiCall, schemaName: ContractSchemaName): MatcherResult {
    const violations = contractValidator.findViolations(schemaName, call.response.body);
    return {
      name: 'toSatisfyContract',
      pass: violations.length === 0,
      message: () =>
        violations.length === 0
          ? `Expected ${describeRequest(call.request)} not to satisfy the ${schemaName} schema, but it did.`
          : [
              `Contract violation: ${describeRequest(call.request)} does not match the ${schemaName} schema`,
              `(contract/activity-ranking-api.openapi.yaml):`,
              formatViolations(violations),
            ].join('\n'),
    };
  },

  toBeProblemResponse(
    call: AnsweredApiCall,
    expectedStatus: number,
    expectedType: ProblemType,
  ): MatcherResult {
    const body = call.response.body as Partial<Record<'type' | 'status', unknown>> | null | undefined;
    const findings: string[] = [];
    if (call.response.status !== expectedStatus) {
      findings.push(`HTTP status is ${call.response.status}, expected ${expectedStatus}`);
    }
    if (!call.response.contentType.includes(MEDIA_TYPES.problemJson)) {
      findings.push(
        `Content-Type is "${call.response.contentType}", expected "${MEDIA_TYPES.problemJson}" (RFC 9457)`,
      );
    }
    if (body === null || typeof body !== 'object' || body.type !== expectedType) {
      findings.push(`problem type is ${JSON.stringify(body?.type)}, expected "${expectedType}"`);
    }
    if (body !== null && typeof body === 'object' && body.status !== call.response.status) {
      findings.push(`problem "status" field ${JSON.stringify(body.status)} differs from the HTTP status`);
    }
    const schemaViolations = contractValidator.findViolations('Problem', call.response.body);
    if (schemaViolations.length > 0) {
      findings.push(`problem body violates the contract:\n${formatViolations(schemaViolations)}`);
    }
    return {
      name: 'toBeProblemResponse',
      pass: findings.length === 0,
      message: () =>
        [
          `Unexpected HTTP status or problem details for ${describeRequest(call.request)}:`,
          ...findings.map((finding) => `  • ${finding}`),
          `  response body: ${previewBody(call.response.body)}`,
        ].join('\n'),
    };
  },
});

export function previewBody(body: unknown): string {
  const printed = typeof body === 'string' ? body : JSON.stringify(body);
  return printed.length > MAXIMUM_BODY_PREVIEW_LENGTH
    ? `${printed.slice(0, MAXIMUM_BODY_PREVIEW_LENGTH)}… (truncated)`
    : printed;
}
