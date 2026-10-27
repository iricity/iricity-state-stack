import { PAYLOAD_PROFILES, hashPayload } from '@iricity/frontier-shared';
import { profileSchemas } from '../schemas/recordSchemas.js';
import { validateWithSchema } from '../utils/validateRecord.js';

/**
 * Payload profiles: standard external payloads wrapped unchanged into canonical
 * records. The payload is never rewritten; the record carries it plus its hash,
 * the profile id, and the few indexable fields the registry needs.
 *
 * Carrier field per record type: navigation and time carry `payload`; measurement
 * carries `value`; entity carries `payload`. Every wrapped record also carries
 * `payload_profile` and `payload_hash`.
 */

const ZONE_SUFFIX = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/;
const FRACTION = /\.(\d+)/;

/**
 * Normalize a timestamp to ISO-8601 UTC with millisecond precision.
 * CCSDS OMM epochs carry no zone designator and are UTC by definition. Offsets of the
 * forms +hh:mm, +hhmm and +hh are accepted. Unparseable input is an error, never
 * replaced by the current time.
 */
export function toIso(value, label = 'timestamp') {
  if (value === null || value === undefined || value === '') {
    throw new TypeError(`${label} is required`);
  }
  let text = String(value).trim();
  const fraction = text.match(FRACTION);
  if (fraction && fraction[1].length > 3) {
    text = text.replace(FRACTION, `.${fraction[1].slice(0, 3)}`);
  }
  const zoneMatch = text.match(ZONE_SUFFIX);
  if (zoneMatch && /^[+-]\d{4}$/.test(zoneMatch[0])) {
    text = `${text.slice(0, -5)}${zoneMatch[0].slice(0, 3)}:${zoneMatch[0].slice(3)}`;
  } else if (zoneMatch && /^[+-]\d{2}$/.test(zoneMatch[0])) {
    text = `${text}:00`;
  } else if (!zoneMatch) {
    text = `${text}Z`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} is not a valid ISO-8601 timestamp: ${value}`);
  }
  return date.toISOString();
}

export function validateProfilePayload(profileName, payload) {
  if (typeof profileName !== 'string' || !Object.hasOwn(profileSchemas, profileName)) {
    return { ok: false, errors: [`unknown profile: ${profileName}`] };
  }
  return validateWithSchema(profileSchemas[profileName], payload);
}

/** CCSDS Orbit Mean-Elements Message (JSON key-value form, as served by CelesTrak) -> navigation record. */
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
    timestamp: toIso(omm.EPOCH, 'OMM EPOCH')
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
    window_start: toIso(observation.start, 'observation start'),
    window_end: observation.end ? toIso(observation.end, 'observation end') : null,
    timestamp: toIso(observation.start, 'observation start'),
    source: options.source ?? 'satnogs'
  };
}

/** STAC Item -> entity record describing a data product, carrying the item unchanged. */
export function entityRecordFromStacItem(item, options = {}) {
  const validation = validateProfilePayload('stac-item', item);
  if (!validation.ok) throw new Error(`invalid STAC item: ${validation.errors.join(', ')}`);
  const datetime = item.properties?.datetime ?? item.properties?.start_datetime;
  if (!datetime) throw new Error('invalid STAC item: properties.datetime or properties.start_datetime is required');

  return {
    record_type: 'entity',
    entity_id: options.entity_id ?? `stac_${item.collection ?? 'item'}_${item.id}`,
    entity_type: 'data_product',
    controller_id: options.controller_id ?? item.collection ?? 'unknown',
    status: 'available',
    created_at: toIso(datetime, 'STAC datetime'),
    payload_profile: PAYLOAD_PROFILES.STAC_ITEM,
    payload: item,
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
    timestamp: toIso(pass.aos, 'pass aos'),
    time_scale: 'UTC',
    clock_source: options.clock_source ?? 'sgp4_prediction',
    window_kind: 'predicted_pass',
    window_start: toIso(pass.aos, 'pass aos'),
    window_end: toIso(pass.los, 'pass los'),
    time_of_closest_approach: toIso(pass.tca, 'pass tca'),
    max_elevation_deg: pass.max_elevation_deg,
    duration_seconds: pass.duration_seconds,
    entity_id: options.entity_id ?? `norad_${pass.norad_cat_id}`,
    observer_id: options.observer_id ?? pass.observer_id ?? null,
    payload_profile: PAYLOAD_PROFILES.PASS_PREDICTION,
    payload: pass,
    payload_hash: hashPayload(pass)
  };
}

/** Wrap an envelope payload into a canonical record according to its payload_type. */
/** A node's signed self-description, wrapped as its identity record. The signer must be the DID it names. */
export function entityRecordFromNodeDescriptor(descriptor, options = {}) {
  const shape = validateProfilePayload('node-descriptor', descriptor);
  if (!shape.ok) throw new Error(`invalid node descriptor: ${shape.errors.join(', ')}`);
  if (options.signer && options.signer !== descriptor.did) {
    throw new Error(`node descriptor for ${descriptor.did} was signed by ${options.signer}`);
  }
  return {
    record_type: 'entity',
    entity_id: descriptor.node_id,
    entity_type: 'node',
    identity_type: 'node',
    did: descriptor.did,
    public_key_multibase: descriptor.did.slice('did:key:'.length),
    controller_id: descriptor.operator,
    display_name: descriptor.name ?? null,
    status: 'active',
    created_at: toIso(descriptor.generated_at, 'generated_at'),
    discovered_at: options.timestamp ?? new Date().toISOString(),
    payload_profile: PAYLOAD_PROFILES.NODE_DESCRIPTOR,
    payload_hash: hashPayload(descriptor),
    payload: descriptor
  };
}

/** A registry's signed chain head, wrapped as a measurement by that registry. */
export function measurementRecordFromChainHead(head, options = {}) {
  const shape = validateProfilePayload('chain-head', head);
  if (!shape.ok) throw new Error(`invalid chain head: ${shape.errors.join(', ')}`);
  if (options.signer && options.signer !== head.registry_did) {
    throw new Error(`chain head for ${head.registry_did} was signed by ${options.signer}`);
  }
  return {
    record_type: 'measurement',
    sensor_id: head.registry_did,
    measurement_type: 'chain_head',
    value: head,
    unit: 'receipt',
    timestamp: toIso(head.timestamp, 'timestamp'),
    source: options.signer ?? head.registry_did,
    payload_profile: PAYLOAD_PROFILES.CHAIN_HEAD,
    payload_hash: hashPayload(head)
  };
}

export function recordFromEnvelopePayload(payloadType, payload, options = {}) {
  switch (payloadType) {
    case PAYLOAD_PROFILES.NODE_DESCRIPTOR:
      return entityRecordFromNodeDescriptor(payload, options);
    case PAYLOAD_PROFILES.CHAIN_HEAD:
      return measurementRecordFromChainHead(payload, options);
    case PAYLOAD_PROFILES.STATE_RECORD:
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.record_type !== 'string') {
        throw new Error('state-record.json/1 payload must be a canonical record with record_type');
      }
      return payload;
    case PAYLOAD_PROFILES.CCSDS_OMM_JSON:
      return navigationRecordFromOmm(payload, options);
    case PAYLOAD_PROFILES.SATNOGS_OBSERVATION:
      return measurementRecordFromSatnogsObservation(payload, options);
    case PAYLOAD_PROFILES.STAC_ITEM:
      return entityRecordFromStacItem(payload, options);
    case PAYLOAD_PROFILES.PASS_PREDICTION:
      return timeRecordFromPass(payload, options);
    case PAYLOAD_PROFILES.OPAQUE_JSON:
      return {
        record_type: 'measurement',
        sensor_id: options.sensor_id ?? options.signer ?? 'unknown',
        measurement_type: PAYLOAD_PROFILES.OPAQUE_JSON,
        value: payload,
        unit: 'opaque',
        payload_profile: PAYLOAD_PROFILES.OPAQUE_JSON,
        payload_hash: hashPayload(payload),
        timestamp: options.timestamp ?? new Date().toISOString(),
        source: options.signer ?? 'unknown'
      };
    default:
      throw new Error(`unknown payload_type: ${payloadType}`);
  }
}
