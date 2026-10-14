/**
 * Gherkin trims table cells, so values that are blank, whitespace or very long are written as
 * readable tokens in square brackets and expanded here:
 *   [empty]          -> ""
 *   [3 spaces]       -> "   "
 *   [101 letters]    -> "aaaa…" (101 characters)
 * Anything else is used verbatim.
 */
export function expandTestValue(value: string): string {
  if (value === '[empty]') {
    return '';
  }
  const repeatedCharacters = /^\[(\d+) (spaces|letters)\]$/.exec(value);
  if (repeatedCharacters?.[1] !== undefined) {
    const length = Number(repeatedCharacters[1]);
    return (repeatedCharacters[2] === 'spaces' ? ' ' : 'a').repeat(length);
  }
  return value;
}

/** Parses "city=Paris & locationId=2988507" into query parameters, expanding tokens. */
export function parseQueryParameters(specification: string): Record<string, string> {
  if (specification.trim() === '(no parameters)') {
    return {};
  }
  return Object.fromEntries(
    specification.split(' & ').map((assignment) => {
      const separatorIndex = assignment.indexOf('=');
      if (separatorIndex < 0) {
        throw new Error(`Parameter "${assignment}" must be written as name=value.`);
      }
      return [
        assignment.slice(0, separatorIndex).trim(),
        expandTestValue(assignment.slice(separatorIndex + 1).trim()),
      ];
    }),
  );
}

/** "day 3" style ordinal used by the feature files, validated against the forecast length. */
export function parseDayNumber(dayNumber: number, forecastLengthInDays: number): number {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > forecastLengthInDays) {
    throw new Error(`Day must be between 1 and ${forecastLengthInDays}, received ${dayNumber}.`);
  }
  return dayNumber;
}
