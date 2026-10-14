import { defineConfig } from 'allure';

/** Matches the phrase anywhere in a multi-line failure message. */
const messageContaining = (phrase) => `[\\s\\S]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*`;
const UNSUCCESSFUL_STATUSES = ['failed', 'broken'];

/**
 * Groups failures by *why* they failed. While the service does not exist everything lands in
 * "Not implemented yet"; once it does, the other categories become a triage board. Matching
 * relies on the stable message prefixes used by the suite's matchers and errors.
 */
const failureCategory = (name, phrase) => ({
  name,
  messageRegex: messageContaining(phrase),
  matchedStatuses: UNSUCCESSFUL_STATUSES,
  groupByMessage: false,
});

export default defineConfig({
  name: 'Activity Ranking API: acceptance specification',
  output: './allure-report',
  historyPath: './allure-history/history.jsonl',
  categories: {
    rules: [
      failureCategory(
        'Not implemented yet: Activity Ranking API unreachable',
        'Activity Ranking API is not reachable',
      ),
      failureCategory(
        'Service hangs: Activity Ranking API did not answer',
        'Activity Ranking API did not answer',
      ),
      failureCategory(
        'Test environment: weather provider stub unavailable',
        'Weather provider stub (WireMock) is not reachable',
      ),
      failureCategory('Contract violation', 'Contract violation'),
      failureCategory('Ranking behaviour differs from the specification', 'Ranking expectation not met'),
      failureCategory(
        'Location resolution differs from the specification',
        'Location resolution differs from the specification',
      ),
      failureCategory('Weather provider integration', 'Weather provider integration'),
      failureCategory('Unexpected HTTP status or problem details', 'Unexpected HTTP status'),
      failureCategory('Front-end experience expectation not met', 'Front-end expectation not met'),
      failureCategory('Weather provider stub has drifted from the live Open-Meteo API', 'Stub drift'),
    ],
  },
  plugins: {
    awesome: {
      options: {
        reportName: 'Activity Ranking API: acceptance specification',
        groupBy: ['epic', 'feature', 'story'],
      },
    },
  },
});
