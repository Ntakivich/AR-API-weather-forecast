import * as allure from 'allure-js-commons';
import { createBdd, test as bddTest } from 'playwright-bdd';

import { ActivityRankingApiClient } from '../clients/activity-ranking-api-client';
import { LiveOpenMeteoClient } from '../clients/live-open-meteo-client';
import { testEnvironment } from '../config/test-environment';
import { documentScenarioInReport } from '../reporting/scenario-documentation';
import { WeatherProviderStub } from '../stubs/weather-provider/weather-provider-stub';
import { WireMockAdminClient } from '../stubs/wiremock/wiremock-admin-client';
import { ScenarioContext } from './scenario-context';

const LIVE_WEATHER_PROVIDER_SCENARIOS = '@live-weather-provider';
const STUBBED_WEATHER_PROVIDER_SCENARIOS = `not ${LIVE_WEATHER_PROVIDER_SCENARIOS}`;

interface ScenarioFixtures {
  scenario: ScenarioContext;
  activityRankingApi: ActivityRankingApiClient;
  weatherProvider: WeatherProviderStub;
  liveWeatherProvider: LiveOpenMeteoClient;
}

export const test = bddTest.extend<ScenarioFixtures>({
  scenario: async ({}, use) => {
    await use(new ScenarioContext(testEnvironment.apiBaseUrl));
  },
  activityRankingApi: async ({ request }, use) => {
    await use(new ActivityRankingApiClient(request, testEnvironment.apiBaseUrl));
  },
  weatherProvider: async ({}, use) => {
    await use(new WeatherProviderStub(new WireMockAdminClient(testEnvironment.weatherProviderStubUrl)));
  },
  liveWeatherProvider: async ({}, use) => {
    await use(new LiveOpenMeteoClient());
  },
});

export const { Given, When, Then, Before, After, BeforeStep } = createBdd(test);

Before({ name: 'document the scenario in the Allure report' }, async ({ $bddContext }) => {
  await documentScenarioInReport(
    $bddContext.featureUri,
    $bddContext.bddTestData.pickleLine,
    $bddContext.tags,
  );
});

Before(
  { name: 'reset the weather provider stub', tags: STUBBED_WEATHER_PROVIDER_SCENARIOS },
  async ({ weatherProvider }) => {
    await weatherProvider.resetToKnownState();
  },
);

BeforeStep(({ scenario, $step }) => {
  scenario.currentStepText = $step.title;
});

After(
  { name: 'attach weather provider traffic', tags: STUBBED_WEATHER_PROVIDER_SCENARIOS },
  async ({ weatherProvider }) => {
    const unansweredRequests = await weatherProvider.describeUnansweredRequests();
    if (unansweredRequests.length > 0) {
      await allure.attachment(
        'Weather provider requests with no matching stub',
        unansweredRequests.join('\n'),
        'text/plain',
      );
    }
  },
);
