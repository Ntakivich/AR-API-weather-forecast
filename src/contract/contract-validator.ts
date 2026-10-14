import { readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

import type { ContractSchemaName } from './activity-ranking-contract';

const OPENAPI_DOCUMENT_PATH = path.resolve(__dirname, '../../contract/activity-ranking-api.openapi.yaml');
const CONTRACT_SCHEMA_ID = 'activity-ranking-api';
const OPENAPI_SCHEMA_REFERENCE_PREFIX = '#/components/schemas/';
const JSON_SCHEMA_DEFINITIONS_PREFIX = `${CONTRACT_SCHEMA_ID}#/$defs/`;
const MAXIMUM_PRINTED_VALUE_LENGTH = 80;

export interface ContractViolation {
  /** Readable location of the offending value, e.g. `days[2].activities[1].suitabilityScore`. */
  location: string;
  /** What the contract expects, phrased for a failure message. */
  expectation: string;
}

interface OpenApiDocument {
  components: { schemas: Record<string, unknown> };
}

/**
 * Validates payloads against the component schemas of the OpenAPI contract and explains
 * violations in plain language instead of raw JSON Schema error objects.
 */
export class ContractValidator {
  private readonly ajv: Ajv2020;
  private readonly compiledValidators = new Map<ContractSchemaName, ValidateFunction>();

  constructor(openApiDocumentPath: string = OPENAPI_DOCUMENT_PATH) {
    const openApiDocument = parseYaml(readFileSync(openApiDocumentPath, 'utf8')) as OpenApiDocument;
    // OpenAPI 3.1 schemas are JSON Schema 2020-12; only their reference prefix differs.
    const referencesRewritten = JSON.stringify(openApiDocument.components.schemas).replaceAll(
      OPENAPI_SCHEMA_REFERENCE_PREFIX,
      JSON_SCHEMA_DEFINITIONS_PREFIX,
    );
    this.ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictRequired: false });
    addFormats(this.ajv);
    this.ajv.addSchema({ $id: CONTRACT_SCHEMA_ID, $defs: JSON.parse(referencesRewritten) as object });
  }

  findViolations(schemaName: ContractSchemaName, payload: unknown): ContractViolation[] {
    const validate = this.validatorFor(schemaName);
    if (validate(payload)) {
      return [];
    }
    return (validate.errors ?? []).map((error) => describeViolation(error, payload));
  }

  private validatorFor(schemaName: ContractSchemaName): ValidateFunction {
    const cachedValidator = this.compiledValidators.get(schemaName);
    if (cachedValidator !== undefined) {
      return cachedValidator;
    }
    const validator = this.ajv.getSchema(`${JSON_SCHEMA_DEFINITIONS_PREFIX}${schemaName}`);
    if (validator === undefined) {
      throw new Error(`Schema "${schemaName}" is not defined in ${OPENAPI_DOCUMENT_PATH}.`);
    }
    this.compiledValidators.set(schemaName, validator);
    return validator;
  }
}

export const contractValidator = new ContractValidator();

export function formatViolations(violations: readonly ContractViolation[]): string {
  return violations.map((violation) => `  • ${violation.location}: ${violation.expectation}`).join('\n');
}

function describeViolation(error: ErrorObject, payload: unknown): ContractViolation {
  const location = toReadablePath(error.instancePath);
  const actualValue = printValue(valueAtPointer(payload, error.instancePath));
  const params = error.params as Record<string, unknown>;

  switch (error.keyword) {
    case 'required':
      return { location, expectation: `missing required property "${String(params.missingProperty)}"` };
    case 'additionalProperties':
      return {
        location,
        expectation: `unexpected property "${String(params.additionalProperty)}" (not in the contract)`,
      };
    case 'enum':
      return {
        location,
        expectation: `must be one of ${printValue(params.allowedValues)}, actual ${actualValue}`,
      };
    case 'const':
      return {
        location,
        expectation: `must equal ${printValue(params.allowedValue)}, actual ${actualValue}`,
      };
    case 'minItems':
    case 'maxItems': {
      const actualItems = valueAtPointer(payload, error.instancePath);
      const actualCount = Array.isArray(actualItems) ? actualItems.length : 0;
      const bound = error.keyword === 'minItems' ? 'at least' : 'at most';
      return {
        location,
        expectation: `must contain ${bound} ${String(params.limit)} items, actual ${actualCount}`,
      };
    }
    default:
      return { location, expectation: `${error.message ?? 'is invalid'}, actual ${actualValue}` };
  }
}

function toReadablePath(instancePath: string): string {
  if (instancePath === '') {
    return '(response body)';
  }
  return instancePath
    .split('/')
    .slice(1)
    .map((segment) => decodePointerSegment(segment))
    .reduce(
      (readablePath, segment) =>
        /^\d+$/.test(segment)
          ? `${readablePath}[${segment}]`
          : `${readablePath}${readablePath === '' ? '' : '.'}${segment}`,
      '',
    );
}

function valueAtPointer(payload: unknown, instancePath: string): unknown {
  if (instancePath === '') {
    return payload;
  }
  return instancePath
    .split('/')
    .slice(1)
    .reduce<unknown>((currentValue, segment) => {
      if (currentValue !== null && typeof currentValue === 'object') {
        return (currentValue as Record<string, unknown>)[decodePointerSegment(segment)];
      }
      return undefined;
    }, payload);
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function printValue(value: unknown): string {
  const printed = value === undefined ? 'undefined' : JSON.stringify(value);
  return printed.length > MAXIMUM_PRINTED_VALUE_LENGTH
    ? `${printed.slice(0, MAXIMUM_PRINTED_VALUE_LENGTH)}…`
    : printed;
}
