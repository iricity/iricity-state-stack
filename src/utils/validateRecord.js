import { hasRecordSchema, schemas } from '../schemas/recordSchemas.js';

/**
 * Small, dependency-free JSON Schema validator covering the subset the protocol
 * schemas use: type, const, enum, pattern, minimum, maximum, minLength, required,
 * properties, items, additionalProperties. Schemas are loaded from the JSON files
 * in /schemas, so the validator can never drift from the published spec.
 */

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  const allowed = Array.isArray(expected) ? expected : [expected];
  return allowed.some((type) => {
    if (type === 'number') return actual === 'number' || actual === 'integer';
    if (type === 'integer') return actual === 'integer';
    return type === actual;
  });
}

export function validateAgainstSchema(schema, value, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push(`${path} must be ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }

  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} must match ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && [...value].length < schema.minLength) {
      errors.push(`${path} must be at least ${schema.minLength} characters`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must have at least ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateAgainstSchema(schema.items, item, `${path}[${index}]`, errors));
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const field of schema.required ?? []) {
      if (!(field in value) || value[field] === undefined) errors.push(`${path}.${field} is required`);
    }
    const properties = schema.properties ?? {};
    for (const [field, definition] of Object.entries(properties)) {
      if (field in value) validateAgainstSchema(definition, value[field], `${path}.${field}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  return errors;
}

export function validateRecord(recordType, record) {
  const schema = hasRecordSchema(recordType) && recordType !== 'envelope' ? schemas[recordType] : null;
  if (!schema) {
    return { ok: false, errors: [`unknown record type: ${recordType}`] };
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, errors: ['record must be an object'] };
  }
  const errors = validateAgainstSchema(schema, record).map((message) =>
    message.replace(/^\$\.(\w+) is required$/, 'missing required field: $1')
  );
  return { ok: errors.length === 0, errors };
}

export function validateWithSchema(schema, value) {
  const errors = validateAgainstSchema(schema, value);
  return { ok: errors.length === 0, errors };
}
