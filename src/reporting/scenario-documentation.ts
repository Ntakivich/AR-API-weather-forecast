import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import type { FeatureChild, GherkinDocument, Rule, Scenario } from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import * as allure from 'allure-js-commons';

const REPORT_EPIC = 'Activity Ranking API';
const SEVERITY_TAGS = ['@blocker', '@critical', '@major', '@minor', '@trivial'] as const;
const DEFAULT_SEVERITY = 'normal';

interface ScenarioDocumentation {
  featureName: string;
  featureDescription: string;
  ruleName?: string;
  ruleDescription?: string;
  scenarioDescription: string;
}

const parsedFeatures = new Map<string, GherkinDocument>();

/**
 * Turns the Gherkin itself into Allure metadata so the report reads as living documentation:
 * epic / feature / story come from Feature and Rule, and the free-text descriptions (the
 * "why this matters" written for product and front-end readers) become the test description.
 */
export async function documentScenarioInReport(
  featureUri: string,
  scenarioLine: number,
  tags: readonly string[],
): Promise<void> {
  const documentation = findScenarioDocumentation(featureUri, scenarioLine);
  await allure.epic(REPORT_EPIC);
  await allure.severity(severityFromTags(tags));
  if (documentation === undefined) {
    return;
  }
  await allure.feature(documentation.featureName);
  if (documentation.ruleName !== undefined) {
    await allure.story(documentation.ruleName);
  }
  await allure.description(toMarkdown(documentation));
}

function severityFromTags(tags: readonly string[]): string {
  const severityTag = SEVERITY_TAGS.find((severity) => tags.includes(severity));
  return severityTag === undefined ? DEFAULT_SEVERITY : severityTag.slice(1);
}

function toMarkdown(documentation: ScenarioDocumentation): string {
  const sections = [`**Feature: ${documentation.featureName}**`, documentation.featureDescription];
  if (documentation.ruleName !== undefined) {
    sections.push(`**Rule: ${documentation.ruleName}**`, documentation.ruleDescription ?? '');
  }
  if (documentation.scenarioDescription !== '') {
    sections.push('**Why this scenario matters**', documentation.scenarioDescription);
  }
  return sections.filter((section) => section.trim() !== '').join('\n\n');
}

function findScenarioDocumentation(
  featureUri: string,
  scenarioLine: number,
): ScenarioDocumentation | undefined {
  const feature = parseFeature(featureUri).feature;
  if (feature === undefined) {
    return undefined;
  }
  const featureDocumentation = {
    featureName: feature.name,
    featureDescription: dedent(feature.description),
  };
  for (const child of feature.children) {
    if (child.rule !== undefined) {
      const scenario = findScenarioIn(child.rule.children, scenarioLine);
      if (scenario !== undefined) {
        return { ...featureDocumentation, ...describeRule(child.rule), ...describeScenario(scenario) };
      }
    }
    const scenario = findScenarioIn([child], scenarioLine);
    if (scenario !== undefined) {
      return { ...featureDocumentation, ...describeScenario(scenario) };
    }
  }
  return undefined;
}

function findScenarioIn(children: readonly FeatureChild[], scenarioLine: number): Scenario | undefined {
  return children
    .map((child) => child.scenario)
    .find(
      (scenario) =>
        scenario !== undefined &&
        (scenario.location.line === scenarioLine ||
          scenario.examples.some((examples) =>
            examples.tableBody.some((exampleRow) => exampleRow.location.line === scenarioLine),
          )),
    );
}

function describeRule(rule: Rule): Pick<ScenarioDocumentation, 'ruleName' | 'ruleDescription'> {
  return { ruleName: rule.name, ruleDescription: dedent(rule.description) };
}

function describeScenario(scenario: Scenario): Pick<ScenarioDocumentation, 'scenarioDescription'> {
  return { scenarioDescription: dedent(scenario.description) };
}

function parseFeature(featureUri: string): GherkinDocument {
  const absolutePath = path.resolve(featureUri);
  const cachedDocument = parsedFeatures.get(absolutePath);
  if (cachedDocument !== undefined) {
    return cachedDocument;
  }
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const document = parser.parse(readFileSync(absolutePath, 'utf8'));
  parsedFeatures.set(absolutePath, document);
  return document;
}

function dedent(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
