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
  recordFromEnvelopePayload,
  schemas,
  timeRecordFromPass,
  validateProfilePayload,
  validateRecord,
  validateWithSchema
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

const OBSERVATION = {
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

const STAC = {
  type: 'Feature',
  stac_version: '1.0.0',
  id: 'S2A_TILE_20260101',
  collection: 'sentinel-2-l2a',
  geometry: { type: 'Point', coordinates: [77.2, 28.6] },
  properties: { datetime: '2026-01-01T05:30:00Z', license: 'proprietary' },
  assets: { visual: { href: 'https://example.org/visual.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized' } },
  links: []
};

const PASS = {
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

test('protocol description names the three core modules, the wire formats and the conformance rule', () => {
  assert.equal(PROTOCOL.name, 'Frontier State Protocol');
  assert.equal(PROTOCOL.name_status, 'proposed');
  assert.deepEqual(PROTOCOL.core_modules, ['identity', 'authorization', 'verification']);
  assert.equal(PROTOCOL.wire_formats.envelope, 'state-envelope/1');
  assert.equal(PROTOCOL.wire_formats.receipt, 'state-receipt/1');
  assert.equal(PROTOCOL.conformance.vectors_version, '2');
  const names = listSchemaNames();
  assert.ok(names.records.includes('authorization'));
  assert.equal(names.records.includes('envelope'), false);
  assert.deepEqual(names.envelope, ['envelope']);
  assert.ok(names.profiles.includes('ccsds-omm'));
  assert.ok(getSchema('envelope').required.includes('signer'));
  assert.equal(getSchema('constructor'), null);
  assert.equal(getSchema('__proto__'), null);
  for (const schema of [...Object.values(schemas)]) assert.match(schema.$id, /^urn:frontier-state-protocol:schema:/);
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
  assert.throws(() => navigationRecordFromOmm({ ...OMM, EPOCH: '2026-13-45T99:99:99' }), /not a valid ISO-8601/);
});

test('SatNOGS observations wrap unchanged into measurement records', () => {
  const record = measurementRecordFromSatnogsObservation(OBSERVATION);
  assert.equal(record.record_type, 'measurement');
  assert.equal(record.sensor_id, 'satnogs_station_2134');
  assert.equal(record.measurement_type, 'rf_observation');
  assert.deepEqual(record.value, OBSERVATION);
  assert.equal(record.payload_profile, 'satnogs.observation.json/1');
  assert.equal(validateRecord('measurement', record).ok, true);
  assert.equal(validateProfilePayload('satnogs-observation', { id: 1 }).ok, false);
  assert.equal(validateProfilePayload('constructor', {}).ok, false);
});

test('STAC items wrap into data-product entity records carrying the item', () => {
  const record = entityRecordFromStacItem(STAC);
  assert.equal(record.entity_type, 'data_product');
  assert.equal(record.stac_collection, 'sentinel-2-l2a');
  assert.deepEqual(record.payload, STAC);
  assert.deepEqual(record.asset_keys, ['visual']);
  assert.equal(validateRecord('entity', record).ok, true);
  assert.throws(() => entityRecordFromStacItem({ ...STAC, type: 'FeatureCollection' }), /invalid STAC/);
  assert.throws(() => entityRecordFromStacItem({ ...STAC, properties: { license: 'x' } }), /datetime/);
});

test('predicted passes become time records', () => {
  const record = timeRecordFromPass(PASS);
  assert.equal(record.record_type, 'time');
  assert.equal(record.window_kind, 'predicted_pass');
  assert.equal(record.entity_id, 'norad_25544');
  assert.equal(record.observer_id, 'node_zone_001_delhi');
  assert.equal(validateRecord('time', record).ok, true);
  assert.throws(() => timeRecordFromPass({ ...PASS, max_elevation_deg: 95 }), /invalid pass/);
  assert.throws(() => timeRecordFromPass({ ...PASS, tca: 'x' }), /not a valid/);
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

test('envelopes are dispatched by payload_type on ingest and checked against the envelope schema', () => {
  const registry = new InMemoryStateRegistry();
  const node = generateEd25519KeyPair();

  const asRecord = registry.ingestEnvelope(createEnvelope({ payload: navigationRecordFromOmm(OMM), payload_type: 'state-record.json/1', signer: node }));
  assert.equal(asRecord.record.record_type, 'navigation');
  assert.equal(asRecord.record.signer, node.did);
  assert.ok(asRecord.record.envelope_hash);

  const asOmm = registry.ingestEnvelope(createEnvelope({ payload: OMM, payload_type: 'ccsds.omm.json/1', signer: node }));
  assert.equal(asOmm.record.record_type, 'navigation', 'an OMM envelope becomes a navigation record');
  assert.equal(asOmm.record.norad_cat_id, 25544);

  const asObservation = registry.ingestEnvelope(createEnvelope({ payload: OBSERVATION, payload_type: 'satnogs.observation.json/1', signer: node }));
  assert.equal(asObservation.record.measurement_type, 'rf_observation');

  const asStac = registry.ingestEnvelope(createEnvelope({ payload: STAC, payload_type: 'stac.item.json/1', signer: node }));
  assert.equal(asStac.record.entity_type, 'data_product');

  const asPass = registry.ingestEnvelope(createEnvelope({ payload: PASS, payload_type: 'pass-prediction.json/1', signer: node }));
  assert.equal(asPass.record.window_kind, 'predicted_pass');

  const opaque = registry.ingestEnvelope(createEnvelope({ payload: { any: 'thing', record_type: 'entity' }, payload_type: 'opaque.json/1', signer: node }));
  assert.equal(opaque.record.record_type, 'measurement', 'opaque payloads never become records by smuggling a record_type');
  assert.equal(opaque.record.payload_profile, 'opaque.json/1');

  assert.throws(() => registry.ingestEnvelope(createEnvelope({ payload: { x: 1 }, payload_type: 'mystery/1', signer: node })), /unknown payload_type/);
  assert.throws(() => registry.ingestEnvelope(createEnvelope({ payload: { x: 1 }, payload_type: 'state-record.json/1', signer: node })), /canonical record/);
  const receiptPayload = { record_type: 'receipt', receipt_id: 'rcp_' + '0'.repeat(24), record_hash: 'sha256:' + '0'.repeat(64), previous_hash: null, timestamp: '2026-01-01T00:00:00Z', issuer: 'x', signature_algorithm: 'none' };
  assert.throws(() => registry.ingestEnvelope(createEnvelope({ payload: receiptPayload, payload_type: 'state-record.json/1', signer: node })), /does not verify/);

  const envelope = createEnvelope({ payload: OMM, payload_type: 'ccsds.omm.json/1', signer: node });
  assert.throws(() => registry.ingestEnvelope({ ...envelope, payload: { ...OMM, NORAD_CAT_ID: 1 } }), /envelope rejected/);
  assert.throws(() => registry.ingestEnvelope({ ...envelope, payload: undefined }), /payload body is required/);
  assert.throws(() => registry.ingestEnvelope({ ...envelope, note: 'extra' }), /not allowed/);
  assert.equal(validateWithSchema(schemas.envelope, envelope).ok, true);
  assert.equal(recordFromEnvelopePayload('opaque.json/1', 'text', { signer: node.did }).value, 'text');
});
