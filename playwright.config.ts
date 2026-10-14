import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

import { testEnvironment } from './src/config/test-environment';

const LIVE_WEATHER_PROVIDER_TAG = /@live-weather-provider/;
const SCENARIO_TIMEOUT_MILLISECONDS = 30_000;
const ASSERTION_TIMEOUT_MILLISECONDS = 10_000;

const generatedTestsDirectory = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['src/fixtures/**/*.ts', 'src/steps/**/*.ts'],
  featuresRoot: 'features',
});

export default defineConfig({
  testDir: generatedTestsDirectory,
  timeout: SCENARIO_TIMEOUT_MILLISECONDS,
  expect: { timeout: ASSERTION_TIMEOUT_MILLISECONDS },
  forbidOnly: testEnvironment.isContinuousIntegration,
  // A spec-first suite must not hide flaky behaviour behind retries.
  retries: 0,
  // The service under test and the weather stub are single shared instances, so scenarios
  // that stub different weather for the same city must not overlap.
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        detail: true,
        suiteTitle: false,
        environmentInfo: {
          'Activity Ranking API': testEnvironment.apiBaseUrl,
          'Weather provider stub (WireMock)': testEnvironment.weatherProviderStubUrl,
          'Node.js': process.version,
        },
      },
    ],
  ],
  use: {
    baseURL: testEnvironment.apiBaseUrl,
    extraHTTPHeaders: { Accept: 'application/json, application/problem+json' },
  },
  projects: [
    {
      name: 'acceptance',
      grepInvert: LIVE_WEATHER_PROVIDER_TAG,
    },
    {
      name: 'live-weather-provider',
      grep: LIVE_WEATHER_PROVIDER_TAG,
    },
  ],
});
