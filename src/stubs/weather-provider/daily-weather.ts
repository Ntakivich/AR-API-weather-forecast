/** WMO weather interpretation codes used by Open-Meteo's `weather_code`. */
export enum WmoWeatherCode {
  ClearSky = 0,
  MainlyClear = 1,
  PartlyCloudy = 2,
  Overcast = 3,
  Fog = 45,
  ModerateDrizzle = 53,
  ModerateRain = 63,
  HeavyRain = 65,
  SlightSnowfall = 71,
  ModerateSnowfall = 73,
  HeavySnowfall = 75,
  Thunderstorm = 95,
}

/** One day of weather at a place, in the units Open-Meteo uses by default. */
export interface DailyWeather {
  weatherCode: WmoWeatherCode;
  maximumTemperatureCelsius: number;
  minimumTemperatureCelsius: number;
  precipitationMillimetres: number;
  rainMillimetres: number;
  snowfallCentimetres: number;
  precipitationProbabilityPercent: number;
  maximumWindSpeedKilometresPerHour: number;
  maximumWindGustsKilometresPerHour: number;
  /** Null for inland places: the marine API has no sea cell to report on. */
  maximumWaveHeightMetres: number | null;
  maximumWavePeriodSeconds: number | null;
  maximumSwellWaveHeightMetres: number | null;
}

/**
 * Named, recognisable weather conditions the feature files refer to.
 * Each one has an unambiguous "best activity" so it can act as a test oracle.
 */
export const WEATHER_CONDITIONS = {
  'heavy snow and freezing': {
    weatherCode: WmoWeatherCode.HeavySnowfall,
    maximumTemperatureCelsius: -3,
    minimumTemperatureCelsius: -11,
    precipitationMillimetres: 21,
    rainMillimetres: 0,
    snowfallCentimetres: 30,
    precipitationProbabilityPercent: 95,
    maximumWindSpeedKilometresPerHour: 12,
    maximumWindGustsKilometresPerHour: 25,
    maximumWaveHeightMetres: null,
    maximumWavePeriodSeconds: null,
    maximumSwellWaveHeightMetres: null,
  },
  'clear and warm': {
    weatherCode: WmoWeatherCode.ClearSky,
    maximumTemperatureCelsius: 22,
    minimumTemperatureCelsius: 13,
    precipitationMillimetres: 0,
    rainMillimetres: 0,
    snowfallCentimetres: 0,
    precipitationProbabilityPercent: 0,
    maximumWindSpeedKilometresPerHour: 9,
    maximumWindGustsKilometresPerHour: 18,
    maximumWaveHeightMetres: 0.3,
    maximumWavePeriodSeconds: 5,
    maximumSwellWaveHeightMetres: 0.2,
  },
  'clean surfing swell': {
    weatherCode: WmoWeatherCode.PartlyCloudy,
    maximumTemperatureCelsius: 19,
    minimumTemperatureCelsius: 14,
    precipitationMillimetres: 0,
    rainMillimetres: 0,
    snowfallCentimetres: 0,
    precipitationProbabilityPercent: 5,
    maximumWindSpeedKilometresPerHour: 11,
    maximumWindGustsKilometresPerHour: 20,
    maximumWaveHeightMetres: 1.9,
    maximumWavePeriodSeconds: 13,
    maximumSwellWaveHeightMetres: 1.7,
  },
  'storm with heavy rain': {
    weatherCode: WmoWeatherCode.Thunderstorm,
    maximumTemperatureCelsius: 13,
    minimumTemperatureCelsius: 9,
    precipitationMillimetres: 42,
    rainMillimetres: 42,
    snowfallCentimetres: 0,
    precipitationProbabilityPercent: 100,
    maximumWindSpeedKilometresPerHour: 78,
    maximumWindGustsKilometresPerHour: 115,
    maximumWaveHeightMetres: 6.2,
    maximumWavePeriodSeconds: 9,
    maximumSwellWaveHeightMetres: 4.8,
  },
  'mild and overcast': {
    weatherCode: WmoWeatherCode.Overcast,
    maximumTemperatureCelsius: 15,
    minimumTemperatureCelsius: 9,
    precipitationMillimetres: 0.4,
    rainMillimetres: 0.4,
    snowfallCentimetres: 0,
    precipitationProbabilityPercent: 20,
    maximumWindSpeedKilometresPerHour: 16,
    maximumWindGustsKilometresPerHour: 30,
    maximumWaveHeightMetres: 0.8,
    maximumWavePeriodSeconds: 7,
    maximumSwellWaveHeightMetres: 0.6,
  },
  'extreme heat': {
    weatherCode: WmoWeatherCode.ClearSky,
    maximumTemperatureCelsius: 46,
    minimumTemperatureCelsius: 31,
    precipitationMillimetres: 0,
    rainMillimetres: 0,
    snowfallCentimetres: 0,
    precipitationProbabilityPercent: 0,
    maximumWindSpeedKilometresPerHour: 14,
    maximumWindGustsKilometresPerHour: 24,
    maximumWaveHeightMetres: 0.5,
    maximumWavePeriodSeconds: 6,
    maximumSwellWaveHeightMetres: 0.4,
  },
  'extreme cold': {
    weatherCode: WmoWeatherCode.MainlyClear,
    maximumTemperatureCelsius: -32,
    minimumTemperatureCelsius: -45,
    precipitationMillimetres: 0,
    rainMillimetres: 0,
    snowfallCentimetres: 0,
    precipitationProbabilityPercent: 0,
    maximumWindSpeedKilometresPerHour: 20,
    maximumWindGustsKilometresPerHour: 35,
    maximumWaveHeightMetres: null,
    maximumWavePeriodSeconds: null,
    maximumSwellWaveHeightMetres: null,
  },
  'record snowfall': {
    weatherCode: WmoWeatherCode.HeavySnowfall,
    maximumTemperatureCelsius: -6,
    minimumTemperatureCelsius: -14,
    precipitationMillimetres: 140,
    rainMillimetres: 0,
    snowfallCentimetres: 200,
    precipitationProbabilityPercent: 100,
    maximumWindSpeedKilometresPerHour: 25,
    maximumWindGustsKilometresPerHour: 45,
    maximumWaveHeightMetres: null,
    maximumWavePeriodSeconds: null,
    maximumSwellWaveHeightMetres: null,
  },
} as const satisfies Record<string, DailyWeather>;

export type WeatherConditionName = keyof typeof WEATHER_CONDITIONS;

/** Weather assumed for any day a scenario does not describe explicitly. */
export const UNREMARKABLE_WEATHER_CONDITION: WeatherConditionName = 'mild and overcast';

export function weatherCondition(conditionName: string): DailyWeather {
  if (!isWeatherConditionName(conditionName)) {
    const knownConditions = Object.keys(WEATHER_CONDITIONS)
      .map((knownName) => `"${knownName}"`)
      .join(', ');
    throw new Error(`Unknown weather condition "${conditionName}". Known conditions: ${knownConditions}.`);
  }
  return { ...WEATHER_CONDITIONS[conditionName] };
}

function isWeatherConditionName(conditionName: string): conditionName is WeatherConditionName {
  return Object.hasOwn(WEATHER_CONDITIONS, conditionName);
}

/** Short human description of a day, used in failure messages and Allure attachments. */
export function describeDailyWeather(weather: DailyWeather): string {
  const waves =
    weather.maximumWaveHeightMetres === null
      ? 'no marine data'
      : `waves ${weather.maximumWaveHeightMetres} m @ ${weather.maximumWavePeriodSeconds ?? '?'} s`;
  return [
    `WMO ${weather.weatherCode} (${WmoWeatherCode[weather.weatherCode]})`,
    `${weather.minimumTemperatureCelsius}…${weather.maximumTemperatureCelsius} °C`,
    `snow ${weather.snowfallCentimetres} cm`,
    `rain ${weather.rainMillimetres} mm`,
    `wind ${weather.maximumWindSpeedKilometresPerHour} km/h`,
    waves,
  ].join(', ');
}
