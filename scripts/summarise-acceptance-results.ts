/**
 * Prints a Markdown summary of the generated Allure report, used for the GitHub job summary and
 * the pull request comment: totals, how many scenarios failed for each reason (failure category)
 * and, when REPORT_URL is set, a link to the published Allure report.
 */
import { readFileSync } from 'node:fs';

interface ReportSummary {
  stats: Record<string, number>;
}

interface CategoryTree {
  roots: string[];
  nodes: Record<string, { name?: string; statistic?: Record<string, number> }>;
}

const REPORT_DIRECTORY = 'allure-report';
const TEST_STATUSES = ['passed', 'failed', 'broken', 'skipped', 'unknown'];

const summary = JSON.parse(readFileSync(`${REPORT_DIRECTORY}/summary.json`, 'utf8')) as ReportSummary;
const categories = JSON.parse(
  readFileSync(`${REPORT_DIRECTORY}/widgets/categories.json`, 'utf8'),
) as CategoryTree;

const lines = [
  '## Activity Ranking API: acceptance specification',
  '',
  `**${summary.stats.total ?? 0} scenarios**: ${Object.entries(summary.stats)
    .filter(([status]) => TEST_STATUSES.includes(status))
    .map(([status, count]) => `${count} ${status}`)
    .join(', ')}`,
  '',
  '| Why scenarios failed | Scenarios |',
  '| --- | ---: |',
  ...categories.roots.map((rootId) => {
    const category = categories.nodes[rootId];
    return `| ${category?.name ?? rootId} | ${category?.statistic?.total ?? 0} |`;
  }),
  '',
  ...(process.env.REPORT_URL ? [`[Open the Allure report](${process.env.REPORT_URL})`, ''] : []),
  '> Spec-first suite: until the service exists, every scenario is expected to be in ' +
    '"Not implemented yet". Any other category points at a real gap once the service is running.',
];

process.stdout.write(`${lines.join('\n')}\n`);
