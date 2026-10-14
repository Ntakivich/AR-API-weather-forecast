/**
 * Open-Meteo response shapes, as observed on the live API (see the live-weather-provider project,
 * which re-checks them against the real service so the stubs cannot silently drift).
 */

export const OPEN_METEO_ENDPOINTS = {
  geocodingSearch: '/v1/search',
  geocodingLookupById: '/v1/get',
  forecast: '/v1/forecast',
  marine: '/v1/marine',
} as const;

export type OpenMeteoEndpointName = keyof typeof OPEN_METEO_ENDPOINTS;

export const OPEN_METEO_LIVE_BASE_URLS = {
  geocoding: 'https://geocoding-api.open-meteo.com',
  forecast: 'https://api.open-meteo.com',
  marine: 'https://marine-api.open-meteo.com',
} as const;

export interface OpenMeteoPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  feature_code: string;
  country_code: string;
  timezone: string;
  population?: number;
  country: string;
  admin1?: string;
}

/** Open-Meteo omits `results` entirely when nothing matches. */
export interface OpenMeteoGeocodingSearchResponse {
  results?: OpenMeteoPlace[];
  generationtime_ms: number;
}

export interface OpenMeteoErrorResponse {
  error: true;
  reason: string;
}

export const FORECAST_DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'rain_sum',
  'snowfall_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
] as const;

export const MARINE_DAILY_VARIABLES = [
  'wave_height_max',
  'wave_period_max',
  'swell_wave_height_max',
] as const;

export type ForecastDailyVariable = (typeof FORECAST_DAILY_VARIABLES)[number];
export type MarineDailyVariable = (typeof MARINE_DAILY_VARIABLES)[number];

interface OpenMeteoDailyResponse<DailyVariable extends string> {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  daily_units: Record<'time' | DailyVariable, string>;
  daily: { time: string[] } & Record<DailyVariable, (number | null)[]>;
}

export type OpenMeteoForecastResponse = OpenMeteoDailyResponse<ForecastDailyVariable>;
export type OpenMeteoMarineResponse = OpenMeteoDailyResponse<MarineDailyVariable>;
