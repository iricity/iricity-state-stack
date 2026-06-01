import { schemas } from '../schemas/recordSchemas.js';

function typeMatches(expectedType, value) {
  if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expectedType === 'string') return typeof value === 'string';
  if (expectedType === 'boolean') return typeof value === 'boolean';
  if (expectedType === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return true;
}

export function validateRecord(recordType, record) {
  const schema = schemas[recordType];
  if (!schema) {
    return {
      ok: false,
      errors: [`unknown record type: ${recordType}`]
    };
  }

  const errors = [];
  for (const field of schema.required ?? []) {
    if (!(field in record)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const [field, definition] of Object.entries(schema.properties ?? {})) {
    if (!(field in record)) continue;
    if (definition.const !== undefined && record[field] !== definition.const) {
      errors.push(`field ${field} must equal ${definition.const}`);
      continue;
    }
    if (definition.type && !typeMatches(definition.type, record[field])) {
      errors.push(`field ${field} must be ${definition.type}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

