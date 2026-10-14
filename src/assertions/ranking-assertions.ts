import type {
  ActivityAssessment,
  ActivityName,
  ActivityRankingReport,
  DailyActivityRanking,
  SuitabilityRating,
} from '../contract/activity-ranking-contract';
import { ACTIVITY_NAMES, SUITABILITY_SCORE_RANGE } from '../contract/activity-ranking-contract';
import type { DailyWeather } from '../stubs/weather-provider/daily-weather';
import { describeDailyWeather } from '../stubs/weather-provider/daily-weather';
import type { ForecastWeek } from '../stubs/weather-provider/open-meteo-response-builders';

const SCORE_COLUMN_WIDTH = String(SUITABILITY_SCORE_RANGE.highest).length;

/** Ratings that describe a real assessment, from least to most suitable. */
export const RATING_ORDER: readonly SuitabilityRating[] = ['POOR', 'FAIR', 'GOOD', 'EXCELLENT'];

export class RankingExpectationError extends Error {
  constructor(expectation: string, evidence: readonly string[]) {
    super([`Ranking expectation not met: ${expectation}`, ...evidence].join('\n'));
    this.name = 'RankingExpectationError';
  }
}

/** Everything a ranking assertion needs to explain itself: the answer and the weather behind it. */
export interface RankingEvidence {
  report: ActivityRankingReport;
  stubbedWeek: ForecastWeek | undefined;
}

export interface DayUnderTest {
  dayNumber: number;
  day: DailyActivityRanking;
}

/** Returns why the day breaks the expectation, or undefined when it meets it. */
export type DayCheck = (dayUnderTest: DayUnderTest) => string | undefined;

/**
 * Runs the check on the selected days and fails once, listing every offending day with its
 * full ranking and the stubbed weather, so a single run shows the whole picture.
 */
export function expectDays(
  evidence: RankingEvidence,
  expectation: string,
  check: DayCheck,
  selectDay: (dayNumber: number) => boolean = () => true,
): void {
  const failures = evidence.report.days
    .map((day, dayIndex) => ({ day, dayNumber: dayIndex + 1 }))
    .filter(({ dayNumber }) => selectDay(dayNumber))
    .flatMap((dayUnderTest) => {
      const reason = check(dayUnderTest);
      return reason === undefined ? [] : [describeFailingDay(evidence, dayUnderTest, reason)];
    });
  if (failures.length > 0) {
    throw new RankingExpectationError(expectation, failures);
  }
}

export function assessmentOf(
  day: DailyActivityRanking,
  activity: ActivityName,
): ActivityAssessment | undefined {
  return day.activities.find((assessment) => assessment.activity === activity);
}

export function isRatedAtLeast(rating: SuitabilityRating, minimumRating: SuitabilityRating): boolean {
  return RATING_ORDER.indexOf(rating) >= RATING_ORDER.indexOf(minimumRating);
}

export function parseActivityName(text: string): ActivityName {
  const activity = ACTIVITY_NAMES.find((name) => name === text);
  if (activity === undefined) {
    throw new Error(`Unknown activity "${text}". Known activities: ${ACTIVITY_NAMES.join(', ')}.`);
  }
  return activity;
}

export function parseRating(text: string): SuitabilityRating {
  const knownRatings: readonly SuitabilityRating[] = [...RATING_ORDER, 'UNAVAILABLE'];
  const rating = knownRatings.find((knownRating) => knownRating === text);
  if (rating === undefined) {
    throw new Error(`Unknown suitability rating "${text}". Known ratings: ${knownRatings.join(', ')}.`);
  }
  return rating;
}

export function formatDayRanking(day: DailyActivityRanking): string {
  return [...day.activities]
    .sort((first, second) => first.rank - second.rank)
    .map(
      (assessment) =>
        `      #${assessment.rank} ${assessment.activity.padEnd('Outdoor Sightseeing'.length)} ` +
        `score ${String(assessment.suitabilityScore).padStart(SCORE_COLUMN_WIDTH)}  ${assessment.suitabilityRating.padEnd(
          'UNAVAILABLE'.length,
        )}  ${JSON.stringify(assessment.reasons)}`,
    )
    .join('\n');
}

function describeFailingDay(
  evidence: RankingEvidence,
  { day, dayNumber }: DayUnderTest,
  reason: string,
): string {
  const stubbedWeather: DailyWeather | null | undefined = evidence.stubbedWeek?.days[dayNumber - 1];
  const weatherLine =
    stubbedWeather === undefined
      ? ''
      : `\n    stubbed weather: ${stubbedWeather === null ? 'no data' : describeDailyWeather(stubbedWeather)}`;
  return [
    `  • day ${dayNumber} (${day.date}): ${reason}${weatherLine}`,
    '    actual ranking:',
    formatDayRanking(day),
  ].join('\n');
}
