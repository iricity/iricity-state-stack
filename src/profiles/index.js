import { PAYLOAD_PROFILES, hashPayload } from '@iricity/frontier-shared';
import { profileSchemas } from '../schemas/recordSchemas.js';
import { validateWithSchema } from '../utils/validateRecord.js';

/**
 * Payload profiles: standard external payloads wrapped unchanged into canonical
 * records. The payload is never rewritten; the record carries it plus its hash,
 * the profile id, and the few indexable fields the registry needs.
 */

function toIso(value) {
  if (!value) return new Date().toISOString();
  const text = String(value);
  // CCSDS OMM epochs carry no zone designator and are UTC by definition.
  const withZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function validateProfilePayload(profileName, payload) {
  const schema = profileSchemas[profileName];
  if (!schema) return { ok: false, errors: [`unknown profile: ${profileName}`] };
  return validateWithSchema(schema, payload);
}

/** CCSDS Orbit Mean-Elements Message (JSON form, as served by CelesTrak) -> navigation record. */
export function navigationRecordFromOmm(omm, options = {}) {
  const validation = validateProfilePayload('ccsds-omm', omm);
  if (!validation.ok) throw new Error(`invalid OMM payload: ${validation.errors.join(', ')}`);

  return {
    record_type: 'navigation',
    entity_id: options.entity_id ?? `norad_${omm.NORAD_CAT_ID}`,
    reference_frame: 'TEME',
    payload_profile: PAYLOAD_PROFILES.CCSDS_OMM_JSON,
    payload: omm,
    payload_hash: hashPayload(omm),
    norad_cat_id: omm.NORAD_CAT_ID,
    object_name: omm.OBJECT_NAME ?? null,
    object_id: omm.OBJECT_ID ?? null,
    epoch: omm.EPOCH,
    sensor_source: options.sensor_source ?? 'celestrak',
    timestamp: toIso(omm.EPOCH)
  };
}

/** SatNOGS Network observation -> measurement record. */
export function measurementRecordFromSatnogsObservation(observation, options = {}) {
  const validation = validateProfilePayload('satnogs-observation', observation);
  if (!validation.ok) throw new Error(`invalid SatNOGS observation: ${validation.errors.join(', ')}`);

  return {
    record_type: 'measurement',
    sensor_id: options.sensor_id ?? `satnogs_station_${observation.ground_station}`,
    measurement_type: 'rf_observation',
    value: observation,
    unit: 'opaque',
    payload_profile: PAYLOAD_PROFILES.SATNOGS_OBSERVATION,
    payload_hash: hashPayload(observation),
    observation_id: observation.id,
    norad_cat_id: observation.norad_cat_id,
    ground_station: observation.ground_station,
    observation_status: observation.status ?? null,
    window_start: toIso(observation.start),
    window_end: observation.end ? toIso(observation.end) : null,
    timestamp: toIso(observation.start),
    source: options.source ?? 'satnogs'
  };
}

/** STAC Item -> entity record describing a data product. */
export function entityRecordFromStacItem(item, options = {}) {
  const validation = validateProfilePayload('stac-item', item);
  if (!validation.ok) throw new Error(`invalid STAC item: ${validation.errors.join(', ')}`);

  return {
    record_type: 'entity',
    entity_id: options.entity_id ?? `stac_${item.collection ?? 'item'}_${item.id}`,
    entity_type: 'data_product',
    controller_id: options.controller_id ?? item.collection ?? 'unknown',
    status: 'available',
    created_at: toIso(item.properties?.datetime ?? item.properties?.start_datetime),
    payload_profile: PAYLOAD_PROFILES.STAC_ITEM,
    payload_hash: hashPayload(item),
    stac_id: item.id,
    stac_collection: item.collection ?? null,
    asset_keys: Object.keys(item.assets ?? {}),
    metadata_hash: hashPayload(item.properties ?? {})
  };
}

/** One predicted pass -> time record (a contact window on the UTC time scale). */
export function timeRecordFromPass(pass, options = {}) {
  const validation = validateProfilePayload('pass-prediction', pass);
  if (!validation.ok) throw new Error(`invalid pass prediction: ${validation.errors.join(', ')}`);

  return {
    record_type: 'time',
    timestamp: toIso(pass.aos),
    time_scale: 'UTC',
    clock_source: options.clock_source ?? 'sgp4_prediction',
    window_kind: 'predicted_pass',
    window_start: toIso(pass.aos),
    window_end: toIso(pass.los),
    time_of_closest_approach: toIso(pass.tca),
    max_elevation_deg: pass.max_elevation_deg,
    duration_seconds: pass.duration_seconds,
    entity_id: options.entity_id ?? `norad_${pass.norad_cat_id}`,
    observer_id: options.observer_id ?? pass.observer_id ?? null,
    payload_profile: PAYLOAD_PROFILES.PASS_PREDICTION,
    payload: pass,
    payload_hash: hashPayload(pass)
  };
}
