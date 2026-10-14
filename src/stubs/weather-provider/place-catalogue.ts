import type { OpenMeteoPlace } from './open-meteo-payloads';

export interface CataloguedPlace {
  /** Geocoding record exactly as Open-Meteo returns it (captured from the live API). */
  record: OpenMeteoPlace;
  /** Whether the marine API returns wave data for this place; inland places get nulls. */
  hasMarineForecast: boolean;
}

/**
 * The simulated world the weather provider stub knows about. Records were captured from the
 * live Open-Meteo geocoding API, including same-named places in different countries, because
 * name collisions are the norm (Paris FR / Paris US-TX), not an edge case.
 */
export const PLACE_CATALOGUE: readonly CataloguedPlace[] = [
  {
    record: {
      id: 3027301,
      name: 'Chamonix',
      latitude: 45.92375,
      longitude: 6.86933,
      elevation: 1060,
      feature_code: 'PPL',
      country_code: 'FR',
      timezone: 'Europe/Paris',
      population: 10614,
      country: 'France',
      admin1: 'Rhône-Alpes',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 2940204,
      name: 'Cham',
      latitude: 49.22565,
      longitude: 12.65501,
      elevation: 396,
      feature_code: 'PPLA3',
      country_code: 'DE',
      timezone: 'Europe/Berlin',
      population: 17314,
      country: 'Germany',
      admin1: 'Bavaria',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 3032797,
      name: 'Biarritz',
      latitude: 43.48055,
      longitude: -1.55684,
      elevation: 39,
      feature_code: 'PPL',
      country_code: 'FR',
      timezone: 'Europe/Paris',
      population: 33188,
      country: 'France',
      admin1: 'New Aquitaine',
    },
    hasMarineForecast: true,
  },
  {
    record: {
      id: 3443611,
      name: 'Biarritz',
      latitude: -34.79191,
      longitude: -55.51387,
      elevation: 30,
      feature_code: 'PPL',
      country_code: 'UY',
      timezone: 'America/Montevideo',
      country: 'Uruguay',
      admin1: 'Canelones',
    },
    hasMarineForecast: true,
  },
  {
    record: {
      id: 2657896,
      name: 'Zurich',
      latitude: 47.36667,
      longitude: 8.55,
      elevation: 429,
      feature_code: 'PPLA',
      country_code: 'CH',
      timezone: 'Europe/Zurich',
      population: 415367,
      country: 'Switzerland',
      admin1: 'Canton of Zurich',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 2643743,
      name: 'London',
      latitude: 51.50853,
      longitude: -0.12574,
      elevation: 25,
      feature_code: 'PPLC',
      country_code: 'GB',
      timezone: 'Europe/London',
      population: 8961989,
      country: 'United Kingdom',
      admin1: 'England',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 6058560,
      name: 'London',
      latitude: 42.98339,
      longitude: -81.23304,
      elevation: 252,
      feature_code: 'PPL',
      country_code: 'CA',
      timezone: 'America/Toronto',
      population: 422324,
      country: 'Canada',
      admin1: 'Ontario',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 4517009,
      name: 'London',
      latitude: 39.88645,
      longitude: -83.44825,
      elevation: 321,
      feature_code: 'PPLA2',
      country_code: 'US',
      timezone: 'America/New_York',
      population: 10060,
      country: 'United States',
      admin1: 'Ohio',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 2988507,
      name: 'Paris',
      latitude: 48.85341,
      longitude: 2.3488,
      elevation: 42,
      feature_code: 'PPLC',
      country_code: 'FR',
      timezone: 'Europe/Paris',
      population: 2138551,
      country: 'France',
      admin1: 'Île-de-France Region',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 4717560,
      name: 'Paris',
      latitude: 33.66094,
      longitude: -95.55551,
      elevation: 183,
      feature_code: 'PPLA2',
      country_code: 'US',
      timezone: 'America/Chicago',
      population: 24782,
      country: 'United States',
      admin1: 'Texas',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 3117735,
      name: 'Madrid',
      latitude: 40.4165,
      longitude: -3.70256,
      elevation: 665,
      feature_code: 'PPLC',
      country_code: 'ES',
      timezone: 'Europe/Madrid',
      population: 3255944,
      country: 'Spain',
      admin1: 'Madrid',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 2267057,
      name: 'Lisbon',
      latitude: 38.72509,
      longitude: -9.1498,
      elevation: 68,
      feature_code: 'PPLC',
      country_code: 'PT',
      timezone: 'Europe/Lisbon',
      population: 517802,
      country: 'Portugal',
      admin1: 'Lisbon District',
    },
    hasMarineForecast: true,
  },
  {
    record: {
      id: 2193733,
      name: 'Auckland',
      latitude: -36.84853,
      longitude: 174.76349,
      elevation: 43,
      feature_code: 'PPLA',
      country_code: 'NZ',
      timezone: 'Pacific/Auckland',
      population: 1547200,
      country: 'New Zealand',
      admin1: 'Auckland',
    },
    hasMarineForecast: true,
  },
  {
    record: {
      id: 5856195,
      name: 'Honolulu',
      latitude: 21.30694,
      longitude: -157.85834,
      elevation: 5,
      feature_code: 'PPLA',
      country_code: 'US',
      timezone: 'Pacific/Honolulu',
      population: 350964,
      country: 'United States',
      admin1: 'Hawaii',
    },
    hasMarineForecast: true,
  },
  {
    record: {
      id: 2636713,
      name: 'Stratford-upon-Avon',
      latitude: 52.19166,
      longitude: -1.70734,
      elevation: 44,
      feature_code: 'PPL',
      country_code: 'GB',
      timezone: 'Europe/London',
      population: 30495,
      country: 'United Kingdom',
      admin1: 'England',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 3175121,
      name: 'L’Aquila',
      latitude: 42.35055,
      longitude: 13.39954,
      elevation: 714,
      feature_code: 'PPLA',
      country_code: 'IT',
      timezone: 'Europe/Rome',
      population: 33691,
      country: 'Italy',
      admin1: 'Abruzzo',
    },
    hasMarineForecast: false,
  },
  {
    record: {
      id: 3451190,
      name: 'Rio de Janeiro',
      latitude: -22.90642,
      longitude: -43.18223,
      elevation: 12,
      feature_code: 'PPLA',
      country_code: 'BR',
      timezone: 'America/Sao_Paulo',
      population: 6747815,
      country: 'Brazil',
      admin1: 'Rio de Janeiro',
    },
    hasMarineForecast: true,
  },
  {
    record: {
      id: 2867714,
      name: 'Munich',
      latitude: 48.13743,
      longitude: 11.57549,
      elevation: 524,
      feature_code: 'PPLA',
      country_code: 'DE',
      timezone: 'Europe/Berlin',
      population: 1260391,
      country: 'Germany',
      admin1: 'Bavaria',
    },
    hasMarineForecast: false,
  },
];

/** Case-, whitespace-, apostrophe- and diacritic-insensitive form used for name matching. */
export function normaliseForMatching(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘`]/g, "'")
    .trim()
    .toLocaleLowerCase('en');
}

/** "Paris, FR" -> the catalogued Paris in France; "Paris" alone -> the most populous Paris. */
export function findCataloguedPlace(placeReference: string): CataloguedPlace {
  const [name = '', countryCode] = placeReference.split(',').map((part) => part.trim());
  const candidates = placesNamedExactly(name).filter(
    (place) => countryCode === undefined || place.record.country_code === countryCode.toUpperCase(),
  );
  const [bestCandidate] = candidates;
  if (bestCandidate === undefined) {
    const knownReferences = PLACE_CATALOGUE.map(
      (place) => `"${place.record.name}, ${place.record.country_code}"`,
    ).join(', ');
    throw new Error(
      `Place "${placeReference}" is not in the stub place catalogue. Known: ${knownReferences}`,
    );
  }
  return bestCandidate;
}

export function findCataloguedPlaceById(locationId: number): CataloguedPlace | undefined {
  return PLACE_CATALOGUE.find((place) => place.record.id === locationId);
}

/** Exact name matches ordered like Open-Meteo orders them: most populous first. */
export function placesNamedExactly(name: string): CataloguedPlace[] {
  const normalisedName = normaliseForMatching(name);
  return sortByRelevance(
    PLACE_CATALOGUE.filter((place) => normaliseForMatching(place.record.name) === normalisedName),
  );
}

export function sortByRelevance(places: readonly CataloguedPlace[]): CataloguedPlace[] {
  return [...places].sort(
    (first, second) => (second.record.population ?? 0) - (first.record.population ?? 0),
  );
}
