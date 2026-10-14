import type { DataTable } from 'playwright-bdd';

import { FORECAST_LENGTH_IN_DAYS } from '../contract/activity-ranking-contract';
import { Given } from '../fixtures/scenario-fixtures';
import { weatherCondition } from '../stubs/weather-provider/daily-weather';
import { findCataloguedPlace } from '../stubs/weather-provider/place-catalogue';
import type { WeatherFactorLevels } from '../stubs/weather-provider/weather-factors';
import { applySingleFactorChange, composeDailyWeather } from '../stubs/weather-provider/weather-factors';
import { parseDayNumber } from '../support/test-values';

const BASELINE_DAY_NUMBER = 1;

Given(
  'the weather in {string} is {string} all week',
  ({ scenario, weatherProvider }, placeReference: string, conditionName: string) => {
    const place = findCataloguedPlace(placeReference);
    scenario.placeUnderTest = place;
    weatherProvider.setWeatherForWholeWeek(place, weatherCondition(conditionName));
  },
);

Given(
  'the weather in {string} on day {int} is {string}',
  ({ scenario, weatherProvider }, placeReference: string, dayNumber: number, conditionName: string) => {
    const place = findCataloguedPlace(placeReference);
    scenario.placeUnderTest = place;
    weatherProvider.setWeatherOnDay(
      place,
      parseDayNumber(dayNumber, FORECAST_LENGTH_IN_DAYS),
      weatherCondition(conditionName),
    );
  },
);

Given(
  /^day (\d+) in "([^"]+)" differs only by an? (.+) of "([^"]+)"$/,
  (
    { scenario, weatherProvider },
    dayNumberText: string,
    placeReference: string,
    factorName: string,
    valueWithUnit: string,
  ) => {
    const place = findCataloguedPlace(placeReference);
    scenario.placeUnderTest = place;
    const baselineWeather = weatherProvider.forecastWeekFor(place).days[BASELINE_DAY_NUMBER - 1];
    if (baselineWeather === null || baselineWeather === undefined) {
      throw new Error(
        `Step definition error: day ${BASELINE_DAY_NUMBER} needs weather before it can be varied.`,
      );
    }
    weatherProvider.setWeatherOnDay(
      place,
      parseDayNumber(Number(dayNumberText), FORECAST_LENGTH_IN_DAYS),
      applySingleFactorChange(baselineWeather, factorName, valueWithUnit),
    );
  },
);

Given(
  'the weather in {string} day by day is:',
  ({ scenario, weatherProvider }, placeReference: string, weatherTable: DataTable) => {
    const place = findCataloguedPlace(placeReference);
    scenario.placeUnderTest = place;
    for (const row of weatherTable.hashes()) {
      const { day, ...factorLevels } = row;
      weatherProvider.setWeatherOnDay(
        place,
        parseDayNumber(Number(day), FORECAST_LENGTH_IN_DAYS),
        composeDailyWeather(factorLevels as WeatherFactorLevels),
      );
    }
  },
);

Given(
  'the weather provider has no data for {string} on day {int}',
  ({ scenario, weatherProvider }, placeReference: string, dayNumber: number) => {
    const place = findCataloguedPlace(placeReference);
    scenario.placeUnderTest = place;
    weatherProvider.setWeatherOnDay(place, parseDayNumber(dayNumber, FORECAST_LENGTH_IN_DAYS), null);
  },
);
