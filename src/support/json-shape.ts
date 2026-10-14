/**
 * Describes the structure of a JSON value as "path: type" lines, ignoring the values themselves.
 * Comparing the shape of a live Open-Meteo response with the shape the stub serves reveals
 * drift (renamed, removed or retyped fields) without depending on today's weather.
 */
export function describeJsonShape(value: unknown, path = '$'): Set<string> {
  const shape = new Set<string>();
  collectShape(value, path, shape);
  return shape;
}

export interface ShapeDifference {
  onlyInLive: string[];
  onlyInStub: string[];
}

export function compareShapes(liveShape: Set<string>, stubShape: Set<string>): ShapeDifference {
  return {
    onlyInLive: [...liveShape].filter((entry) => !stubShape.has(entry)).sort(),
    onlyInStub: [...stubShape].filter((entry) => !liveShape.has(entry)).sort(),
  };
}

function collectShape(value: unknown, path: string, shape: Set<string>): void {
  if (Array.isArray(value)) {
    shape.add(`${path}: array`);
    // Null items are how Open-Meteo reports missing data; they say nothing about the item type.
    value
      .filter((item) => item !== null)
      .forEach((item) => {
        collectShape(item, `${path}[]`, shape);
      });
    return;
  }
  if (value !== null && typeof value === 'object') {
    shape.add(`${path}: object`);
    for (const [key, nestedValue] of Object.entries(value)) {
      collectShape(nestedValue, `${path}.${key}`, shape);
    }
    return;
  }
  shape.add(`${path}: ${value === null ? 'null' : typeof value}`);
}
