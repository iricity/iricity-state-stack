import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryStateRegistry,
  PROTOCOL,
  createAuthorizationRecord,
  createEnvelope,
  createIdentityRecord,
  entityRecordFromStacItem,
  generateEd25519KeyPair,
  getSchema,
  listSchemaNames,
  measurementRecordFromSatnogsObservation,
  navigationRecordFromOmm,
  timeRecordFromPass,
  validateProfilePayload,
  validateRecord
} from '../src/index.js';

const OMM = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-10-15T19:43:34.186944',
  MEAN_MOTION: 15.48879905,
  ECCENTRICITY: 0.00067551,
  INCLINATION: 51.6317,
  RA_OF_ASC_NODE: 63.1136,
  ARG_OF_PERICENTER: 265.8514,
  MEAN_ANOMALY: 94.1703,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59045,
  BSTAR: 0.00010980148,
  MEAN_MOTION_DOT: 0.0000558,
  MEAN_MOTION_DDOT: 0
};

test('protocol description names the three core modules and the wire formats', () => {
  assert.deepEqual(PROTOCOL.core_modules, ['identity', 'authorization', 'verification']);
  assert.equal(PROTOCOL.wire_formats.envelope, 'state-envelope/1');
  assert.equal(PROTOCOL.wire_formats.receipt, 'state-receipt/1');
  assert.equal(PROTOCOL.name, 'Frontier State Protocol');
  assert.equal(PROTOCOL.name_status, 'proposed');
  const names = listSchemaNames();
  assert.ok(names.records.includes('authorization'));
  assert.deepEqual(names.envelope, ['envelope']);
  assert.ok(names.profiles.includes('ccsds-omm'));
  assert.ok(getSchema('envelope').required.includes('signer'));
});

test('OMM payloads wrap unchanged into navigation records', () => {
  const record = navigationRecordFromOmm(OMM);
  assert.equal(record.record_type, 'navigation');
  assert.equal(record.entity_id, 'norad_25544');
  assert.equal(record.payload_profile, 'ccsds.omm.json/1');
  assert.deepEqual(record.payload, OMM);
  assert.equal(record.timestamp, '2026-10-15T19:43:34.186Z');
  assert.equal(validateRecord('navigation', record).ok, true);
  assert.throws(() => navigationRecordFromOmm({ ...OMM, ECCENTRICITY: 1.5 }), /invalid OMM/);
  assert.throws(() => navigationRecordFromOmm({ NORAD_CAT_ID: 1 }), /invalid OMM/);
});

test('SatNOGS observations wrap unchanged into measurement records', () => {
  const observation = {
    id: 12345678,
    start: '2026-10-15T10:00:00Z',
    end: '2026-10-15T10:09:30Z',
    ground_station: 2134,
    transmitter: 'abc',
    norad_cat_id: 25544,
    status: 'good',
    station_name: 'Delhi test',
    max_altitude: 41.2
  };
  const record = measurementRecordFromSatnogsObservation(observation);
  assert.equal(record.record_type, 'measurement');
  assert.equal(record.sensor_id, 'satnogs_station_2134');
  assert.equal(record.measurement_type, 'rf_observation');
  assert.deepEqual(record.value, observation);
  assert.equal(record.payload_profile, 'satnogs.observation.json/1');
  assert.equal(validateRecord('measurement', record).ok, true);
  assert.equal(validateProfilePayload('satnogs-observation', { id: 1 }).ok, false);
});

test('STAC items wrap into data-product entity records', () => {
  const item = {
    type: 'Feature',
    stac_version: '1.0.0',
    id: 'S2A_TILE_20260101',
    collection: 'sentinel-2-l2a',
    geometry: { type: 'Point', coordinates: [77.2, 28.6] },
    properties: { datetime: '2026-01-01T05:30:00Z', license: 'proprietary' },
    assets: { visual: { href: 'https://example.org/visual.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized' } },
    links: []
  };
  const record = entityRecordFromStacItem(item);
  assert.equal(record.entity_type, 'data_product');
  assert.equal(record.stac_collection, 'sentinel-2-l2a');
  assert.deepEqual(record.asset_keys, ['visual']);
  assert.equal(validateRecord('entity', record).ok, true);
  assert.throws(() => entityRecordFromStacItem({ ...item, type: 'FeatureCollection' }), /invalid STAC/);
});

test('predicted passes become time records', () => {
  const pass = {
    norad_cat_id: 25544,
    object_name: 'ISS (ZARYA)',
    observer_id: 'node_zone_001_delhi',
    aos: '2026-10-16T01:00:00.000Z',
    tca: '2026-10-16T01:05:00.000Z',
    los: '2026-10-16T01:10:00.000Z',
    duration_seconds: 600,
    max_elevation_deg: 55.1,
    aos_azimuth_deg: 210,
    los_azimuth_deg: 40
  };
  const record = timeRecordFromPass(pass);
  assert.equal(record.record_type, 'time');
  assert.equal(record.window_kind, 'predicted_pass');
  assert.equal(record.entity_id, 'norad_25544');
  assert.equal(record.observer_id, 'node_zone_001_delhi');
  assert.equal(validateRecord('time', record).ok, true);
  assert.throws(() => timeRecordFromPass({ ...pass, max_elevation_deg: 95 }), /invalid pass/);
});

test('identity and authorization records validate against the schemas', () => {
  const pair = generateEd25519KeyPair();
  const identity = createIdentityRecord({ entity_id: 'node_1', identity_type: 'node', did: pair.did, controller_id: 'org_1' });
  assert.equal(validateRecord('entity', identity).ok, true);

  const authorization = createAuthorizationRecord({
    subject_id: 'node_1',
    controller_id: 'org_1',
    capability: 'receive',
    jurisdiction: 'IN',
    location: { latitude: 28.6139, longitude: 77.209, radius_km: 25 }
  });
  assert.equal(validateRecord('authorization', authorization).ok, true);
});

test('registry ingests signed envelopes and rejects tampered ones', () => {
  const registry = new InMemoryStateRegistry();
  const node = generateEd25519KeyPair();
  const navigation = navigationRecordFromOmm(OMM);
  const envelope = createEnvelope({ payload: navigation, payload_type: 'state-record.json/1', signer: node });

  const result = registry.ingestEnvelope(envelope);
  assert.equal(result.record.record_type, 'navigation');
  assert.equal(result.record.signer, node.did);
  assert.equal(result.record.envelope_hash, envelope.envelope_hash);
  assert.equal(result.envelope_verification.verified, true);

  const opaque = createEnvelope({ payload: { any: 'thing' }, payload_type: 'opaque.json/1', signer: node });
  const wrapped = registry.ingestEnvelope(opaque);
  assert.equal(wrapped.record.record_type, 'measurement');
  assert.equal(wrapped.record.payload_profile, 'opaque.json/1');

  const tampered = { ...envelope, payload: { ...navigation, entity_id: 'norad_1' } };
  assert.throws(() => registry.ingestEnvelope(tampered), /envelope rejected/);
  assert.throws(() => registry.ingestEnvelope({ ...envelope, payload: undefined }), /payload body is required/);
});
