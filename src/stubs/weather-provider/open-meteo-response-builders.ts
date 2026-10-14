import { SEARCH_QUERY_LENGTH, SEARCH_RESULT_LIMIT } from '../../contract/activity-ranking-contract';
import type { IsoDate } from '../../support/calendar';
import { utcOffsetSeconds } from '../../support/calendar';
import type { DailyWeather } from './daily-weather';
import type {
  ForecastDailyVariable,
  MarineDailyVariable,
  OpenMeteoErrorResponse,
  OpenMeteoForecastResponse,
  OpenMeteoGeocodingSearchResponse,
  OpenMeteoMarineResponse,
} from './open-meteo-payloads';
import type { CataloguedPlace } from './place-catalogue';
import { normaliseForMatching, sortByRelevance } from './place-catalogue';

const SIMULATED_GENERATION_TIME_MILLISECONDS = 0.42;

/** One week at one place. A `null` day means the provider returned no values for that date. */
export interface ForecastWeek {
  dates: IsoDate[];
  days: (DailyWeather | null)[];
}

/**
 * Mirrors Open-Meteo geocoding matching: shorter than 2 characters finds nothing, exactly
 * 2 characters must match a whole name, 3 or more characters match the start of a name.
 */
export function simulateGeocodingSearch(
  query: string,
  catalogue: readonly CataloguedPlace[],
  maximumResults: number = SEARCH_RESULT_LIMIT.defaultMatches,
): CataloguedPlace[] {
  const normalisedQuery = normaliseForMatching(query);
  if (normalisedQuery.length < SEARCH_QUERY_LENGTH.minimumCharacters) {
    return [];
  }
  const usesPrefixMatching = normalisedQuery.length >= SEARCH_QUERY_LENGTH.prefixMatchingFromCharacters;
  const matches = catalogue.filter((place) => {
    const normalisedName = normaliseForMatching(place.record.name);
    return usesPrefixMatching
      ? normalisedName.startsWith(normalisedQuery)
      : normalisedName === normalisedQuery;
  });
  return sortByRelevance(matches).slice(0, maximumResults);
}

export function geocodingSearchResponse(
  places: readonly CataloguedPlace[],
): OpenMeteoGeocodingSearchResponse {
  if (places.length === 0) {
    return { generationtime_ms: SIMULATED_GENERATION_TIME_MILLISECONDS };
  }
  return {
    results: places.map((place) => place.record),
    generationtime_ms: SIMULATED_GENERATION_TIME_MILLISECONDS,
  };
}

export function providerErrorResponse(reason: string): OpenMeteoErrorResponse {
  return { error: true, reason };
}

export function forecastResponse(place: CataloguedPlace, week: ForecastWeek): OpenMeteoForecastResponse {
  const valuesFor = (pickValue: (weather: DailyWeather) => number): (number | null)[] =>
    week.days.map((weather) => (weather === null ? null : pickValue(weather)));

  const daily: OpenMeteoForecastResponse['daily'] = {
    time: week.dates,
    weather_code: valuesFor((weather) => weather.weatherCode),
    temperature_2m_max: valuesFor((weather) => weather.maximumTemperatureCelsius),
    temperature_2m_min: valuesFor((weather) => weather.minimumTemperatureCelsius),
    precipitation_sum: valuesFor((weather) => weather.precipitationMillimetres),
    rain_sum: valuesFor((weather) => weather.rainMillimetres),
    snowfall_sum: valuesFor((weather) => weather.snowfallCentimetres),
    precipitation_probability_max: valuesFor((weather) => weather.precipitationProbabilityPercent),
    wind_speed_10m_max: valuesFor((weather) => weather.maximumWindSpeedKilometresPerHour),
    wind_gusts_10m_max: valuesFor((weather) => weather.maximumWindGustsKilometresPerHour),
  };
  const dailyUnits: Record<'time' | ForecastDailyVariable, string> = {
    time: 'iso8601',
    weather_code: 'wmo code',
    temperature_2m_max: '°C',
    temperature_2m_min: '°C',
    precipitation_sum: 'mm',
    rain_sum: 'mm',
    snowfall_sum: 'cm',
    precipitation_probability_max: '%',
    wind_speed_10m_max: 'km/h',
    wind_gusts_10m_max: 'km/h',
  };
  return { ...gridCellMetadata(place), daily_units: dailyUnits, daily };
}

/** Inland places get the same shape with null values, exactly like the live marine API. */
export function marineResponse(place: CataloguedPlace, week: ForecastWeek): OpenMeteoMarineResponse {
  const valuesFor = (pickValue: (weather: DailyWeather) => number | null): (number | null)[] =>
    week.days.map((weather) => (weather === null || !place.hasMarineForecast ? null : pickValue(weather)));

  const daily: OpenMeteoMarineResponse['daily'] = {
    time: week.dates,
    wave_height_max: valuesFor((weather) => weather.maximumWaveHeightMetres),
    wave_period_max: valuesFor((weather) => weather.maximumWavePeriodSeconds),
    swell_wave_height_max: valuesFor((weather) => weather.maximumSwellWaveHeightMetres),
  };
  const dailyUnits: Record<'time' | MarineDailyVariable, string> = {
    time: 'iso8601',
    wave_height_max: 'm',
    wave_period_max: 's',
    swell_wave_height_max: 'm',
  };
  return { ...gridCellMetadata(place), daily_units: dailyUnits, daily };
}

function gridCellMetadata(place: CataloguedPlace) {
  const offsetSeconds = utcOffsetSeconds(place.record.timezone);
  return {
    latitude: place.record.latitude,
    longitude: place.record.longitude,
    generationtime_ms: SIMULATED_GENERATION_TIME_MILLISECONDS,
    utc_offset_seconds: offsetSeconds,
    timezone: place.record.timezone,
    timezone_abbreviation: formatOffsetAbbreviation(offsetSeconds),
    elevation: place.record.elevation,
  };
}

function formatOffsetAbbreviation(offsetSeconds: number): string {
  const secondsPerHour = 3_600;
  const offsetHours = offsetSeconds / secondsPerHour;
  if (offsetHours === 0) {
    return 'GMT';
  }
  return `GMT${offsetHours > 0 ? '+' : ''}${offsetHours}`;
}
