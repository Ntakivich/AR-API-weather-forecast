/**
 * Generates the pairwise weather days used in features/activity-ranking-behaviour.feature.
 *
 * Every pair of levels from any two weather factors appears on at least one day, which covers
 * the 1,296 full combinations with a few weeks of data. The greedy algorithm is deterministic,
 * so re-running it reproduces the committed tables.
 *
 * Usage: npm run pairwise:generate
 */
import type { WeatherFactor } from '../src/stubs/weather-provider/weather-factors';
import { WEATHER_FACTOR_LEVELS } from '../src/stubs/weather-provider/weather-factors';

const DAYS_PER_WEEK = 7;

type Row = Map<WeatherFactor, string>;

const factors = Object.keys(WEATHER_FACTOR_LEVELS) as WeatherFactor[];
const levelsOf = (factor: WeatherFactor): string[] => Object.keys(WEATHER_FACTOR_LEVELS[factor]);

function pairKey(
  firstFactor: WeatherFactor,
  firstLevel: string,
  secondFactor: WeatherFactor,
  secondLevel: string,
) {
  return `${firstFactor}=${firstLevel}|${secondFactor}=${secondLevel}`;
}

function allPairs(): Set<string> {
  const pairs = new Set<string>();
  factors.forEach((firstFactor, firstIndex) => {
    for (const secondFactor of factors.slice(firstIndex + 1)) {
      for (const firstLevel of levelsOf(firstFactor)) {
        for (const secondLevel of levelsOf(secondFactor)) {
          pairs.add(pairKey(firstFactor, firstLevel, secondFactor, secondLevel));
        }
      }
    }
  });
  return pairs;
}

function pairsCoveredBy(row: Row): string[] {
  const covered: string[] = [];
  factors.forEach((firstFactor, firstIndex) => {
    for (const secondFactor of factors.slice(firstIndex + 1)) {
      const firstLevel = row.get(firstFactor);
      const secondLevel = row.get(secondFactor);
      if (firstLevel !== undefined && secondLevel !== undefined) {
        covered.push(pairKey(firstFactor, firstLevel, secondFactor, secondLevel));
      }
    }
  });
  return covered;
}

function generatePairwiseRows(): Row[] {
  const uncovered = allPairs();
  const rows: Row[] = [];
  while (uncovered.size > 0) {
    const [seedPair] = uncovered;
    if (seedPair === undefined) {
      break;
    }
    const row: Row = new Map();
    for (const assignment of seedPair.split('|')) {
      const [factor, level] = assignment.split('=') as [WeatherFactor, string];
      row.set(factor, level);
    }
    for (const factor of factors.filter((candidate) => !row.has(candidate))) {
      let bestLevel = levelsOf(factor)[0] ?? '';
      let bestGain = -1;
      for (const level of levelsOf(factor)) {
        const candidateRow = new Map(row).set(factor, level);
        const gain = pairsCoveredBy(candidateRow).filter((pair) => uncovered.has(pair)).length;
        if (gain > bestGain) {
          bestGain = gain;
          bestLevel = level;
        }
      }
      row.set(factor, bestLevel);
    }
    pairsCoveredBy(row).forEach((pair) => uncovered.delete(pair));
    rows.push(row);
  }
  return rows;
}

function printGherkinWeeks(rows: Row[]): void {
  const header = ['day', ...factors];
  const columnWidths = header.map((column, columnIndex) =>
    Math.max(
      column.length,
      ...rows.map((row) => {
        // Column 0 is the day number; the others follow the factor order.
        const factor = factors[columnIndex - 1];
        return factor === undefined ? 1 : (row.get(factor) ?? '').length;
      }),
    ),
  );
  const formatLine = (cells: string[]) =>
    `        | ${cells.map((cell, index) => cell.padEnd(columnWidths[index] ?? cell.length)).join(' | ')} |`;

  const weekCount = Math.ceil(rows.length / DAYS_PER_WEEK);
  for (let week = 0; week < weekCount; week += 1) {
    console.warn(`\n    # Pairwise week ${week + 1} of ${weekCount}`);
    console.warn(formatLine(header));
    rows.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK).forEach((row, dayIndex) => {
      console.warn(formatLine([String(dayIndex + 1), ...factors.map((factor) => row.get(factor) ?? '')]));
    });
  }
  console.warn(`\n${rows.length} days cover all ${allPairs().size} factor-level pairs.`);
}

printGherkinWeeks(generatePairwiseRows());
