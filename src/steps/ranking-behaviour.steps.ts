import {
  RankingExpectationError,
  assessmentOf,
  expectDays,
  formatDayRanking,
  isRatedAtLeast,
  parseActivityName,
  parseRating,
} from '../assertions/ranking-assertions';
import { expectRankingEvidence } from '../assertions/response-assertions';
import {
  ACTIVITY_NAMES,
  FORECAST_LENGTH_IN_DAYS,
  SUITABILITY_SCORE_RANGE,
} from '../contract/activity-ranking-contract';
import { Then } from '../fixtures/scenario-fixtures';
import { parseDayNumber } from '../support/test-values';

const TOP_RANK = 1;
const LAST_RANK = ACTIVITY_NAMES.length;
const MISSING_DATA_REASON_PATTERN = /missing|unavailable|no (?:forecast|weather)? ?data|not available/i;
const NO_SURF_FORECAST_REASON_PATTERN = /coast|sea\b|ocean|marine|inland|wave|surf/i;

Then('{string} is ranked first on every day', ({ scenario, weatherProvider }, activityText: string) => {
  const activity = parseActivityName(activityText);
  expectDays(
    expectRankingEvidence(scenario, weatherProvider),
    `"${activity}" is ranked first on every day`,
    ({ day }) => {
      const rank = assessmentOf(day, activity)?.rank;
      return rank === TOP_RANK ? undefined : `${activity} is ranked #${rank ?? '?'}`;
    },
  );
});

Then('{string} is ranked last on every day', ({ scenario, weatherProvider }, activityText: string) => {
  const activity = parseActivityName(activityText);
  expectDays(
    expectRankingEvidence(scenario, weatherProvider),
    `"${activity}" is ranked last on every day`,
    ({ day }) => {
      const rank = assessmentOf(day, activity)?.rank;
      return rank === LAST_RANK ? undefined : `${activity} is ranked #${rank ?? '?'}`;
    },
  );
});

Then(
  '{string} is ranked first on day {int}',
  ({ scenario, weatherProvider }, activityText: string, dayNumber: number) => {
    const activity = parseActivityName(activityText);
    const selectedDay = parseDayNumber(dayNumber, FORECAST_LENGTH_IN_DAYS);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `"${activity}" is ranked first on day ${selectedDay}`,
      ({ day }) => {
        const rank = assessmentOf(day, activity)?.rank;
        return rank === TOP_RANK ? undefined : `${activity} is ranked #${rank ?? '?'}`;
      },
      (candidateDay) => candidateDay === selectedDay,
    );
  },
);

Then(
  '{string} is not ranked first on any day except day {int}',
  ({ scenario, weatherProvider }, activityText: string, exceptedDayNumber: number) => {
    const activity = parseActivityName(activityText);
    const exceptedDay = parseDayNumber(exceptedDayNumber, FORECAST_LENGTH_IN_DAYS);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `"${activity}" is only ranked first on day ${exceptedDay}, whose weather differs`,
      ({ day }) => (assessmentOf(day, activity)?.rank === TOP_RANK ? `${activity} is ranked #1` : undefined),
      (candidateDay) => candidateDay !== exceptedDay,
    );
  },
);

Then(
  '{string} is rated at least {string} on every day',
  ({ scenario, weatherProvider }, activityText: string, ratingText: string) => {
    const activity = parseActivityName(activityText);
    const minimumRating = parseRating(ratingText);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `"${activity}" is rated ${minimumRating} or better on every day`,
      ({ day }) => {
        const rating = assessmentOf(day, activity)?.suitabilityRating;
        return rating !== undefined && rating !== 'UNAVAILABLE' && isRatedAtLeast(rating, minimumRating)
          ? undefined
          : `${activity} is rated ${rating ?? '?'}`;
      },
    );
  },
);

Then(
  '{string} is rated {string} on every day',
  ({ scenario, weatherProvider }, activityText: string, ratingText: string) => {
    const activity = parseActivityName(activityText);
    const expectedRating = parseRating(ratingText);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `"${activity}" is rated ${expectedRating} on every day`,
      ({ day }) => {
        const rating = assessmentOf(day, activity)?.suitabilityRating;
        return rating === expectedRating ? undefined : `${activity} is rated ${rating ?? '?'}`;
      },
    );
  },
);

Then(
  /^the "(.+)" score on day (\d+) is (at least|at most) the score on day (\d+)$/,
  (
    { scenario, weatherProvider },
    activityText: string,
    changedDayText: string,
    relation: string,
    baselineDayText: string,
  ) => {
    const activity = parseActivityName(activityText);
    const evidence = expectRankingEvidence(scenario, weatherProvider);
    const changedDayNumber = parseDayNumber(Number(changedDayText), FORECAST_LENGTH_IN_DAYS);
    const baselineDayNumber = parseDayNumber(Number(baselineDayText), FORECAST_LENGTH_IN_DAYS);
    const changedDay = evidence.report.days[changedDayNumber - 1];
    const baselineDay = evidence.report.days[baselineDayNumber - 1];
    const changedScore =
      changedDay === undefined ? undefined : assessmentOf(changedDay, activity)?.suitabilityScore;
    const baselineScore =
      baselineDay === undefined ? undefined : assessmentOf(baselineDay, activity)?.suitabilityScore;
    const holds =
      typeof changedScore === 'number' &&
      typeof baselineScore === 'number' &&
      (relation === 'at least' ? changedScore >= baselineScore : changedScore <= baselineScore);
    if (!holds && changedDay !== undefined && baselineDay !== undefined) {
      throw new RankingExpectationError(
        `${activity} on day ${changedDayNumber} should score ${relation} its score on day ${baselineDayNumber}, ` +
          `because only one weather factor differs (scores: day ${changedDayNumber} = ${String(changedScore)}, ` +
          `day ${baselineDayNumber} = ${String(baselineScore)}).`,
        [
          `  day ${baselineDayNumber} (${baselineDay.date}, baseline):`,
          formatDayRanking(baselineDay),
          `  day ${changedDayNumber} (${changedDay.date}, one factor changed):`,
          formatDayRanking(changedDay),
        ],
      );
    }
  },
);

Then('every day has the same scores, ratings and ranks', ({ scenario, weatherProvider }) => {
  const evidence = expectRankingEvidence(scenario, weatherProvider);
  const [firstDay] = evidence.report.days;
  if (firstDay === undefined) {
    return;
  }
  const fingerprint = (assessments: typeof firstDay.activities) =>
    JSON.stringify(
      [...assessments]
        .sort((first, second) => first.activity.localeCompare(second.activity))
        .map(({ activity, rank, suitabilityScore, suitabilityRating }) => ({
          activity,
          rank,
          suitabilityScore,
          suitabilityRating,
        })),
    );
  const expectedFingerprint = fingerprint(firstDay.activities);
  expectDays(evidence, `identical weather is assessed identically to day 1 (${firstDay.date})`, ({ day }) =>
    fingerprint(day.activities) === expectedFingerprint ? undefined : 'assessed differently from day 1',
  );
});

Then('every day ranks its activities 1 to 4 without ties', ({ scenario, weatherProvider }) => {
  expectDays(
    expectRankingEvidence(scenario, weatherProvider),
    'ranks 1 to 4 are each used exactly once',
    ({ day }) => {
      const ranks = day.activities.map((assessment) => assessment.rank).sort();
      const expectedRanks = ACTIVITY_NAMES.map((_activity, index) => index + 1);
      return JSON.stringify(ranks) === JSON.stringify(expectedRanks)
        ? undefined
        : `ranks are ${JSON.stringify(ranks)}`;
    },
  );
});

Then(
  'every day ranks a higher-scoring activity above a lower-scoring one',
  ({ scenario, weatherProvider }) => {
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      'rank follows score: a higher score never ranks below a lower one, and unavailable activities rank last',
      ({ day }) => {
        const contradictions = day.activities.flatMap((better) =>
          day.activities
            .filter((worse) => rankingScore(better.suitabilityScore) > rankingScore(worse.suitabilityScore))
            .filter((worse) => better.rank > worse.rank)
            .map(
              (worse) =>
                `${better.activity} (score ${String(better.suitabilityScore)}) is ranked #${better.rank}, ` +
                `below ${worse.activity} (score ${String(worse.suitabilityScore)}) at #${worse.rank}`,
            ),
        );
        return contradictions.length === 0 ? undefined : contradictions.join('; ');
      },
    );
  },
);

Then('every assessed activity has a score between 0 and 100', ({ scenario, weatherProvider }) => {
  expectDays(
    expectRankingEvidence(scenario, weatherProvider),
    `every assessed activity scores between ${SUITABILITY_SCORE_RANGE.lowest} and ${SUITABILITY_SCORE_RANGE.highest}`,
    ({ day }) => {
      const invalidScores = day.activities.filter(
        (assessment) =>
          assessment.suitabilityRating !== 'UNAVAILABLE' &&
          (assessment.suitabilityScore === null ||
            !Number.isFinite(assessment.suitabilityScore) ||
            assessment.suitabilityScore < SUITABILITY_SCORE_RANGE.lowest ||
            assessment.suitabilityScore > SUITABILITY_SCORE_RANGE.highest),
      );
      return invalidScores.length === 0
        ? undefined
        : invalidScores
            .map((assessment) => `${assessment.activity} scores ${assessment.suitabilityScore}`)
            .join('; ');
    },
  );
});

Then(
  'every activity on day {int} is rated {string} without a score',
  ({ scenario, weatherProvider }, dayNumber: number, ratingText: string) => {
    const expectedRating = parseRating(ratingText);
    const selectedDay = parseDayNumber(dayNumber, FORECAST_LENGTH_IN_DAYS);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `every activity on day ${selectedDay} is ${expectedRating} with a null score instead of a guess`,
      ({ day }) => {
        const guessed = day.activities.filter(
          (assessment) =>
            assessment.suitabilityRating !== expectedRating || assessment.suitabilityScore !== null,
        );
        return guessed.length === 0
          ? undefined
          : `assessed anyway: ${guessed.map((assessment) => assessment.activity).join(', ')}`;
      },
      (candidateDay) => candidateDay === selectedDay,
    );
  },
);

Then(
  'every reason on day {int} explains that forecast data is missing',
  ({ scenario, weatherProvider }, dayNumber: number) => {
    const selectedDay = parseDayNumber(dayNumber, FORECAST_LENGTH_IN_DAYS);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `every activity on day ${selectedDay} tells the traveller that the forecast is missing`,
      ({ day }) => {
        const unexplained = day.activities.filter(
          (assessment) => !assessment.reasons.some((reason) => MISSING_DATA_REASON_PATTERN.test(reason)),
        );
        return unexplained.length === 0
          ? undefined
          : `no missing-data reason for ${unexplained.map((assessment) => assessment.activity).join(', ')}`;
      },
      (candidateDay) => candidateDay === selectedDay,
    );
  },
);

Then(
  'no activity is rated {string} on any day except day {int}',
  ({ scenario, weatherProvider }, ratingText: string, exceptedDayNumber: number) => {
    const rating = parseRating(ratingText);
    const exceptedDay = parseDayNumber(exceptedDayNumber, FORECAST_LENGTH_IN_DAYS);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `only day ${exceptedDay} lacks data, so no other day is ${rating}`,
      ({ day }) => {
        const affected = day.activities.filter((assessment) => assessment.suitabilityRating === rating);
        return affected.length === 0
          ? undefined
          : `${affected.map((assessment) => assessment.activity).join(', ')} rated ${rating}`;
      },
      (candidateDay) => candidateDay !== exceptedDay,
    );
  },
);

Then(
  'no activity other than {string} is rated {string} on any day',
  ({ scenario, weatherProvider }, activityText: string, ratingText: string) => {
    const exemptActivity = parseActivityName(activityText);
    const rating = parseRating(ratingText);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `only ${exemptActivity} is ${rating}; the other activities are still assessed`,
      ({ day }) => {
        const affected = day.activities.filter(
          (assessment) => assessment.activity !== exemptActivity && assessment.suitabilityRating === rating,
        );
        return affected.length === 0
          ? undefined
          : `${affected.map((assessment) => assessment.activity).join(', ')} rated ${rating}`;
      },
    );
  },
);

Then(
  'the reasons for {string} explain that there is no surf forecast for this location',
  ({ scenario, weatherProvider }, activityText: string) => {
    const activity = parseActivityName(activityText);
    expectDays(
      expectRankingEvidence(scenario, weatherProvider),
      `the reasons for ${activity} explain that the place has no sea or wave forecast`,
      ({ day }) => {
        const reasons = assessmentOf(day, activity)?.reasons ?? [];
        return reasons.some((reason) => NO_SURF_FORECAST_REASON_PATTERN.test(reason))
          ? undefined
          : `reasons are ${JSON.stringify(reasons)}`;
      },
    );
  },
);

/** Unavailable assessments have no score and must rank after every assessed activity. */
function rankingScore(score: number | null): number {
  return score ?? SUITABILITY_SCORE_RANGE.lowest - 1;
}
