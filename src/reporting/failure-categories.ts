import { Status } from 'allure-js-commons';
import type { Category } from 'allure-js-commons/sdk';

const UNSUCCESSFUL_STATUSES = [Status.FAILED, Status.BROKEN];

/** Matches the phrase anywhere in a multi-line failure message. */
function messageContaining(phrase: string): string {
  return `[\\s\\S]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*`;
}

/**
 * Groups failures in the Allure report by *why* they failed. While the service does not exist,
 * everything lands in "Not implemented yet"; once it does, the other categories become a triage
 * board. Matching relies on the stable message prefixes used by the matchers and errors.
 */
export const FAILURE_CATEGORIES: Category[] = [
  {
    name: 'Not implemented yet: Activity Ranking API unreachable',
    description: 'Expected red state of a spec-first suite. Nothing listens on API_BASE_URL.',
    messageRegex: messageContaining('Activity Ranking API is not reachable'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Service hangs: Activity Ranking API did not answer',
    messageRegex: messageContaining('Activity Ranking API did not answer'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Test environment: weather provider stub unavailable',
    description: 'WireMock is down. These failures say nothing about the service under test.',
    messageRegex: messageContaining('Weather provider stub (WireMock) is not reachable'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Contract violation',
    messageRegex: messageContaining('Contract violation'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Ranking behaviour differs from the specification',
    messageRegex: messageContaining('Ranking expectation not met'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Location resolution differs from the specification',
    messageRegex: messageContaining('Location resolution differs from the specification'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Weather provider integration',
    messageRegex: messageContaining('Weather provider integration'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Unexpected HTTP status or problem details',
    messageRegex: messageContaining('Unexpected HTTP status'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Front-end experience expectation not met',
    messageRegex: messageContaining('Front-end expectation not met'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
  {
    name: 'Weather provider stub has drifted from the live Open-Meteo API',
    messageRegex: messageContaining('Stub drift'),
    matchedStatuses: UNSUCCESSFUL_STATUSES,
  },
];
