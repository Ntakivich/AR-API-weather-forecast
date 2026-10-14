const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const DEFAULT_WEATHER_PROVIDER_STUB_URL = 'http://localhost:8080';

function readUrlVariable(variableName: string, defaultValue: string): string {
  const configuredValue = process.env[variableName]?.trim();
  const url = configuredValue === undefined || configuredValue === '' ? defaultValue : configuredValue;
  if (!URL.canParse(url)) {
    throw new Error(`Environment variable ${variableName} must be an absolute URL, received "${url}".`);
  }
  return url.replace(/\/+$/, '');
}

/** Single place where the suite reads its runtime configuration. */
export const testEnvironment = {
  /** Base URL of the Activity Ranking API under test. */
  apiBaseUrl: readUrlVariable('API_BASE_URL', DEFAULT_API_BASE_URL),
  /** WireMock server that impersonates Open-Meteo for the service under test. */
  weatherProviderStubUrl: readUrlVariable('WEATHER_PROVIDER_STUB_URL', DEFAULT_WEATHER_PROVIDER_STUB_URL),
  isContinuousIntegration: process.env.CI === 'true',
} as const;
