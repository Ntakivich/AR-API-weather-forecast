/**
 * Empties allure-results before a run so the report only shows the latest results.
 * The directory itself is kept because Docker bind-mounts it into the test container.
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const RESULTS_DIRECTORY = 'allure-results';

mkdirSync(RESULTS_DIRECTORY, { recursive: true });
for (const entry of readdirSync(RESULTS_DIRECTORY)) {
  rmSync(path.join(RESULTS_DIRECTORY, entry), { recursive: true, force: true });
}
