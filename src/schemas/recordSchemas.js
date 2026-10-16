import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The JSON Schema files under /schemas are the specification. This module loads
 * them once so the validator, the server and the tests all read the same source.
 */

const schemasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas');

function loadDirectory(directory, suffix) {
  const loaded = {};
  if (!fs.existsSync(directory)) return loaded;
  for (const file of fs.readdirSync(directory).sort()) {
    if (!file.endsWith(suffix)) continue;
    const name = file.slice(0, -suffix.length);
    loaded[name] = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  }
  return loaded;
}

/** Canonical record schemas keyed by record_type (entity, authorization, …, receipt). */
export const schemas = loadDirectory(schemasDir, '.schema.json');

/** Payload profile schemas keyed by profile file name (ccsds-omm, satnogs-observation, …). */
export const profileSchemas = loadDirectory(path.join(schemasDir, 'profiles'), '.schema.json');

export const recordTypes = Object.keys(schemas).filter((name) => name !== 'envelope');

export function getSchema(name) {
  return schemas[name] ?? profileSchemas[name] ?? null;
}

export function listSchemaNames() {
  return {
    records: recordTypes,
    envelope: schemas.envelope ? ['envelope'] : [],
    profiles: Object.keys(profileSchemas)
  };
}
