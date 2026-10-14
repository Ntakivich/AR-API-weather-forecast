import type { DailyWeather } from './daily-weather';
import { WmoWeatherCode } from './daily-weather';

/**
 * Equivalence classes for each weather factor that drives activity suitability.
 * Pairwise combinations of these levels exercise the ranking with realistic and deliberately
 * unlikely mixes (hot + heavy snow): the API must stay well-formed for any provider data.
 */
export const WEATHER_FACTOR_LEVELS = {
  temperature: {
    freezing: { maximumCelsius: -8, minimumCelsius: -15 },
    cold: { maximumCelsius: 3, minimumCelsius: -2 },
    mild: { maximumCelsius: 15, minimumCelsius: 8 },
    hot: { maximumCelsius: 34, minimumCelsius: 24 },
  },
  snowfall: {
    none: { centimetres: 0 },
    light: { centimetres: 5 },
    heavy: { centimetres: 35 },
  },
  rain: {
    none: { millimetres: 0 },
    light: { millimetres: 3 },
    heavy: { millimetres: 30 },
  },
  wind: {
    calm: { kilometresPerHour: 5 },
    breezy: { kilometresPerHour: 25 },
    gale: { kilometresPerHour: 70 },
  },
  waves: {
    'no marine data': { heightMetres: null, periodSeconds: null },
    flat: { heightMetres: 0.3, periodSeconds: 5 },
    surfable: { heightMetres: 1.8, periodSeconds: 12 },
    dangerous: { heightMetres: 6, periodSeconds: 9 },
  },
  sky: {
    clear: { weatherCode: WmoWeatherCode.ClearSky },
    overcast: { weatherCode: WmoWeatherCode.Overcast },
    thunderstorm: { weatherCode: WmoWeatherCode.Thunderstorm },
  },
} as const;

export type WeatherFactor = keyof typeof WEATHER_FACTOR_LEVELS;
export type WeatherFactorLevels = Record<WeatherFactor, string>;

const GUSTS_TO_SUSTAINED_WIND_RATIO = 1.6;
const SWELL_SHARE_OF_WAVE_HEIGHT = 0.85;
const PERCENT_CERTAIN = 100;

export function composeDailyWeather(levels: WeatherFactorLevels): DailyWeather {
  const temperature = levelOf('temperature', levels.temperature);
  const snowfall = levelOf('snowfall', levels.snowfall);
  const rain = levelOf('rain', levels.rain);
  const wind = levelOf('wind', levels.wind);
  const waves = levelOf('waves', levels.waves);
  const sky = levelOf('sky', levels.sky);
  const hasPrecipitation = snowfall.centimetres > 0 || rain.millimetres > 0;
  return {
    weatherCode: sky.weatherCode,
    maximumTemperatureCelsius: temperature.maximumCelsius,
    minimumTemperatureCelsius: temperature.minimumCelsius,
    precipitationMillimetres: rain.millimetres + snowfallAsWaterMillimetres(snowfall.centimetres),
    rainMillimetres: rain.millimetres,
    snowfallCentimetres: snowfall.centimetres,
    precipitationProbabilityPercent: hasPrecipitation ? PERCENT_CERTAIN : 0,
    maximumWindSpeedKilometresPerHour: wind.kilometresPerHour,
    maximumWindGustsKilometresPerHour: Math.round(wind.kilometresPerHour * GUSTS_TO_SUSTAINED_WIND_RATIO),
    maximumWaveHeightMetres: waves.heightMetres,
    maximumWavePeriodSeconds: waves.periodSeconds,
    maximumSwellWaveHeightMetres:
      waves.heightMetres === null ? null : roundToTenths(waves.heightMetres * SWELL_SHARE_OF_WAVE_HEIGHT),
  };
}

/** Single-factor changes used by the metamorphic scenarios ("day 2 differs only by ..."). */
export const SINGLE_FACTOR_CHANGES = {
  snowfall: {
    unit: 'cm',
    apply: (weather: DailyWeather, centimetres: number): DailyWeather => ({
      ...weather,
      snowfallCentimetres: centimetres,
      precipitationMillimetres: weather.rainMillimetres + snowfallAsWaterMillimetres(centimetres),
    }),
  },
  rain: {
    unit: 'mm',
    apply: (weather: DailyWeather, millimetres: number): DailyWeather => ({
      ...weather,
      rainMillimetres: millimetres,
      precipitationMillimetres: millimetres + snowfallAsWaterMillimetres(weather.snowfallCentimetres),
    }),
  },
  'wind speed': {
    unit: 'km/h',
    apply: (weather: DailyWeather, kilometresPerHour: number): DailyWeather => ({
      ...weather,
      maximumWindSpeedKilometresPerHour: kilometresPerHour,
      maximumWindGustsKilometresPerHour: Math.max(
        weather.maximumWindGustsKilometresPerHour,
        kilometresPerHour,
      ),
    }),
  },
  'wave height': {
    unit: 'm',
    apply: (weather: DailyWeather, metres: number): DailyWeather => ({
      ...weather,
      maximumWaveHeightMetres: metres,
      maximumSwellWaveHeightMetres: roundToTenths(metres * SWELL_SHARE_OF_WAVE_HEIGHT),
    }),
  },
  'maximum temperature': {
    unit: '°C',
    apply: (weather: DailyWeather, celsius: number): DailyWeather => ({
      ...weather,
      maximumTemperatureCelsius: celsius,
      minimumTemperatureCelsius: Math.min(weather.minimumTemperatureCelsius, celsius),
    }),
  },
} as const;

export type SingleFactorChangeName = keyof typeof SINGLE_FACTOR_CHANGES;

/** Applies e.g. ("snowfall", "60 cm"), rejecting a value written in the wrong unit. */
export function applySingleFactorChange(
  weather: DailyWeather,
  factorName: string,
  valueWithUnit: string,
): DailyWeather {
  if (!Object.hasOwn(SINGLE_FACTOR_CHANGES, factorName)) {
    throw new Error(
      `Unknown weather factor "${factorName}". Known factors: ${Object.keys(SINGLE_FACTOR_CHANGES).join(', ')}.`,
    );
  }
  const change = SINGLE_FACTOR_CHANGES[factorName as SingleFactorChangeName];
  const valueMatch = /^(-?\d+(?:\.\d+)?)\s*(.+)$/.exec(valueWithUnit.trim());
  if (valueMatch?.[1] === undefined || valueMatch[2] !== change.unit) {
    throw new Error(
      `The ${factorName} must be written as "<number> ${change.unit}", received "${valueWithUnit}".`,
    );
  }
  return change.apply(weather, Number(valueMatch[1]));
}

function levelOf<Factor extends WeatherFactor>(
  factor: Factor,
  levelName: string,
): (typeof WEATHER_FACTOR_LEVELS)[Factor][keyof (typeof WEATHER_FACTOR_LEVELS)[Factor]] {
  const levels = WEATHER_FACTOR_LEVELS[factor];
  if (!Object.hasOwn(levels, levelName)) {
    throw new Error(
      `Unknown ${factor} level "${levelName}". Known levels: ${Object.keys(levels).join(', ')}.`,
    );
  }
  return levels[levelName as keyof typeof levels];
}

/** Rule of thumb: 1 cm of fresh snow holds about 0.7 mm of water. */
function snowfallAsWaterMillimetres(snowfallCentimetres: number): number {
  const waterMillimetresPerSnowCentimetre = 0.7;
  return roundToTenths(snowfallCentimetres * waterMillimetresPerSnowCentimetre);
}

function roundToTenths(value: number): number {
  const tenthsPerUnit = 10;
  return Math.round(value * tenthsPerUnit) / tenthsPerUnit;
}
