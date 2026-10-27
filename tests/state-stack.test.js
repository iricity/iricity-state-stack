import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  createReceipt,
  hashRecord,
  InMemoryStateRegistry,
  toIso,
  validateRecord,
  validateRecordSemantics,
  verifyReceipt
} from '../src/index.js';
import { buildStateBridgeArtifact, createRegulatorIssuedAuthorization, generateEd25519KeyPair, hashPayload, verifyReceiptRecord } from '@iricity/frontier-shared';

const NODE = { record_type: 'entity', entity_id: 'NODE-1', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' };

function demoArtifact(id = 'evt_bridge_1') {
  return buildStateBridgeArtifact({
    event: { event_id: id, source: 'space_stack_demo', event_type: 'space_observation', timestamp: '2026-01-01T00:00:00Z', payload: { note: 'bridge demo' } },
    analysis: { analysis_id: `ana_${id}` },
    receipt: null,
    run: { run_id: `run_${id}`, completed_at: '2026-01-01T00:00:01Z' }
  });
}

test('canonicalJson sorts keys deterministically', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
});

test('hashRecord is deterministic', () => {
  assert.equal(hashRecord({ a: 1, b: 2 }), hashRecord({ b: 2, a: 1 }));
});

test('createReceipt is unsigned without a signer and signed with one', () => {
  const unsigned = createReceipt(NODE);
  assert.equal(unsigned.record_type, 'receipt');
  assert.equal(unsigned.signature_algorithm, 'none');
  assert.equal(unsigned.verification_status, 'unsigned');

  const signer = generateEd25519KeyPair();
  const signed = createReceipt(NODE, { signer });
  assert.equal(signed.signature_algorithm, 'ed25519');
  assert.equal(signed.issuer, signer.did);
  assert.equal(verifyReceipt(signed, { record: NODE }).verified, true);
});

test('the registry receipt commits to the record exactly as submitted', () => {
  const registry = new InMemoryStateRegistry();
  const identity = registry.identity();
  assert.match(identity.did, /^did:key:z6Mk/);
  assert.equal(identity.signer_mode, 'ephemeral');

  const first = registry.ingest(NODE);
  const second = registry.ingest({ record_type: 'measurement', sensor_id: 'sensor-1', measurement_type: 'temperature', value: 1, timestamp: '2026-01-01T00:00:01Z' });

  assert.equal(first.receipt.record_hash, hashRecord(NODE), 'receipt names the submitted record');
  assert.equal(first.record.record_hash, first.receipt.record_hash);
  assert.equal(verifyReceiptRecord(first.receipt, { record: NODE }).verified, true, 'a third party verifies against what they sent');
  assert.equal(first.receipt.previous_hash, null);
  assert.equal(second.receipt.previous_hash, first.receipt.receipt_hash);
  assert.equal(first.receipt.issuer, identity.did);

  assert.equal(registry.timeline('NODE-1').length, 1);
  assert.equal(registry.timeline('unknown').length, 0, 'id-less records are not pooled under a magic subject');
  assert.equal(registry.timeline('').length, 0);

  const chain = registry.verifyChain();
  assert.equal(chain.verified, true, chain.errors.join(', '));
  assert.equal(chain.length, 2);

  const single = registry.verifyReceiptById(second.receipt.receipt_id);
  assert.equal(single.verified, true, single.errors.join(', '));
  assert.ok(single.checks.includes('record_hash_match'));
  assert.ok(single.checks.includes('previous_link_match'));

  registry.receipts[0] = { ...registry.receipts[0], timestamp: '2026-01-01T00:00:09Z' };
  assert.equal(registry.verifyChain().verified, false, 'a modified receipt breaks the chain');
});

test('registry accepts a configured signer', () => {
  const signer = generateEd25519KeyPair();
  const registry = new InMemoryStateRegistry({ signer });
  assert.equal(registry.identity().did, signer.did);
  assert.equal(registry.identity().signer_mode, 'configured');
  registry.ingest(NODE);
  assert.equal(registry.verifyChain().verified, true);
});

test('validator enforces enums, patterns, timestamps, nested objects and arrays from the JSON schemas', () => {
  assert.equal(validateRecord('entity', NODE).ok, true);
  assert.deepEqual(validateRecord('entity', { record_type: 'entity', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' }).errors, ['missing required field: entity_id']);
  assert.equal(validateRecord('entity', { ...NODE, created_at: 'now' }).ok, false, 'timestamps must be ISO-8601 UTC');
  assert.equal(validateRecord('entity', { ...NODE, entity_id: undefined }).ok, false, 'undefined does not satisfy required');
  assert.equal(validateRecord('entity', { ...NODE, identity_type: 'spaceship' }).ok, false);
  assert.equal(validateRecord('entity', { ...NODE, did: 'did:web:x' }).ok, false);

  const auth = { record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'receive' };
  assert.equal(validateRecord('authorization', auth).ok, true);
  assert.equal(validateRecord('authorization', { ...auth, capability: 'fly' }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, jurisdiction: 'India' }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, bands: [{ lower_hz: 1 }] }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, bands: [{ lower_hz: 1, upper_hz: 2 }] }).ok, true);
  assert.equal(validateRecord('authorization', { ...auth, location: { latitude: 100, longitude: 0 } }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, valid_from: '2026-01-01' }).ok, false);

  assert.equal(validateRecord('receipt', { record_type: 'receipt', receipt_id: 'r', record_hash: 'nope', timestamp: 't' }).ok, false);
  assert.equal(validateRecord('unknown', {}).ok, false);
  assert.equal(validateRecord('constructor', { record_type: 'constructor' }).ok, false, 'prototype names are not record types');
  assert.equal(validateRecord('__proto__', {}).ok, false);
  assert.equal(validateRecord('envelope', {}).ok, false, 'the envelope schema is not a record type');
});

test('registry enforces the rules the schema cannot express', () => {
  const registry = new InMemoryStateRegistry();
  const base = { record_type: 'authorization', subject_id: 's', controller_id: 'c' };
  assert.throws(() => registry.ingest({ ...base, capability: 'transmit' }), /at least one band/);
  assert.throws(() => registry.ingest({ ...base, capability: 'receive', bands: [{ lower_hz: 9, upper_hz: 1 }] }), /lower_hz < upper_hz/);
  assert.equal(registry.ingest({ ...base, capability: 'transmit', bands: [{ lower_hz: 144e6, upper_hz: 146e6 }] }).record.capability, 'transmit');
  assert.throws(() => registry.ingest({ ...NODE, identity_type: 'node', status: 'bogus' }), /identity records use status/);
  assert.equal(validateRecordSemantics({ ...NODE, identity_type: 'node', status: 'revoked' }).ok, true);
  assert.throws(() => registry.ingest({ record_type: 'constructor' }), /unknown record type/);
  const stray = { record_type: 'receipt', receipt_id: 'rcp_' + '0'.repeat(24), record_hash: hashRecord(NODE), previous_hash: null, timestamp: '2026-01-01T00:00:00Z', issuer: 'x', signature_algorithm: 'none' };
  assert.throws(() => registry.ingest(stray), /does not verify/);
});

test('toIso normalizes offsets and refuses unparseable input instead of inventing a time', () => {
  assert.equal(toIso('2026-10-15T19:43:34.186944'), '2026-10-15T19:43:34.186Z');
  assert.equal(toIso('2026-10-16T01:00:00+05:30'), '2026-10-15T19:30:00.000Z');
  assert.equal(toIso('2026-10-16T01:00:00+0530'), '2026-10-15T19:30:00.000Z');
  assert.equal(toIso('2026-10-16T01:00:00+05'), '2026-10-15T20:00:00.000Z');
  assert.equal(toIso('2026-10-16T01:00:00Z'), '2026-10-16T01:00:00.000Z');
  assert.throws(() => toIso('2026-13-45T99:99:99'), /not a valid ISO-8601/);
  assert.throws(() => toIso('x'), /not a valid/);
  assert.throws(() => toIso(''), /required/);
});

test('registry ingests bridge artifacts only when they bind together, and never trusts the submitted summary', () => {
  const registry = new InMemoryStateRegistry();
  const artifact = demoArtifact();

  const result = registry.ingestBridgeArtifact(artifact);
  assert.equal(result.bridge.bridge_type, 'state_stack_conversion');
  assert.equal(result.bridge.receipt_verification.verified, true);
  assert.equal(result.bridge.identity_bound, false, 'an unsigned bridge receipt is labelled, not upgraded');
  assert.equal(result.bridge.summary.status, 'unsigned');
  assert.equal(result.bridge.summary.source_event_id, 'evt_bridge_1');
  assert.equal(result.bridge.summary.run_id, 'run_evt_bridge_1');
  assert.ok(result.bridge.registry_receipts.conversion_record, 'the conversion record also gets a registry receipt');
  assert.equal(registry.verifyChain().length, 2, 'every accepted record extends the chain');

  const summary = registry.bridgeSummary();
  assert.equal(summary.total, 1);
  assert.equal(summary.by_status.unsigned, 1);
  assert.equal(summary.latest_bridge.bridge_id, result.bridge.bridge_id);

  const tampered = { ...artifact, conversion_record: { ...artifact.conversion_record, conversion_rule: 'edited' } };
  assert.throws(() => registry.ingestBridgeArtifact(tampered), /failed verification/);

  const swapped = { ...demoArtifact('evt_bridge_2'), normalized_record: { ...NODE, entity_id: 'IMPOSTOR' } };
  assert.throws(() => registry.ingestBridgeArtifact(swapped), /normalized_record does not match/);

  const noReceipt = demoArtifact('evt_bridge_3');
  delete noReceipt.receipt.record_type;
  assert.throws(() => registry.ingestBridgeArtifact(noReceipt), /requires a protocol receipt/);

  const forged = { ...demoArtifact('evt_bridge_4'), summary: { bridge_id: 'bridge_FORGED', source_system: 'nasa', status: 'issued' } };
  const stored = registry.ingestBridgeArtifact(forged);
  assert.notEqual(stored.bridge.bridge_id, 'bridge_FORGED');
  assert.equal(stored.bridge.summary.source_system, 'space_stack_demo');
  assert.equal(stored.bridge.summary.status, 'unsigned');

  const signer = generateEd25519KeyPair();
  const signedArtifact = buildStateBridgeArtifact({
    event: { event_id: 'evt_signed', source: 'node', event_type: 'space_observation', timestamp: '2026-01-01T00:00:00Z', payload: { a: 1 } },
    analysis: null,
    receipt: null,
    run: { run_id: 'run_signed', completed_at: '2026-01-01T00:00:01Z' },
    signer
  });
  const signed = registry.ingestBridgeArtifact(signedArtifact);
  assert.equal(signed.bridge.identity_bound, true);
  assert.equal(signed.bridge.summary.status, 'issued');
  assert.equal(signed.bridge.summary.receipt_issuer, signer.did);
  assert.equal(hashPayload(signedArtifact.normalized_record), signedArtifact.conversion_record.normalized_record_hash);
});

test('a regulator-issued authorization is accepted only with a credential bound to it', () => {
  const registry = new InMemoryStateRegistry();
  const regulator = generateEd25519KeyPair();
  const licence = createRegulatorIssuedAuthorization({
    subject_id: 'station_vu2abc',
    capability: 'transmit',
    jurisdiction: 'IN',
    bands: [{ lower_hz: 144e6, upper_hz: 146e6, service: 'amateur' }],
    max_eirp_dbw: 20,
    license_reference: 'ASOC/EXAMPLE/0001',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2031-01-01T00:00:00.000Z',
    regulator,
    created: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(validateRecord('authorization', licence).ok, true, validateRecord('authorization', licence).errors.join(', '));
  const stored = registry.ingest(licence);
  assert.equal(stored.record.profile, 'regulator_issued');
  assert.equal(stored.record.controller_id, regulator.did);

  assert.throws(() => registry.ingest({ ...licence, max_eirp_dbw: 40 }), /proof does not verify.*max_eirp_dbw/);
  assert.throws(() => registry.ingest({ ...licence, proof: null }), /must carry a verifiable credential/);
  assert.throws(() => registry.ingest({ ...licence, controller_id: generateEd25519KeyPair().did }), /not the expected/);
  const { proof, ...noProof } = licence;
  assert.throws(() => registry.ingest({ ...noProof, profile: 'regulator_issued' }), /must carry a verifiable credential/);

  // An expired licence is still an authentic record of what was once granted.
  const expired = createRegulatorIssuedAuthorization({
    subject_id: 'station_old', capability: 'receive', jurisdiction: 'IN',
    valid_from: '2020-01-01T00:00:00.000Z', valid_until: '2021-01-01T00:00:00.000Z', regulator, created: '2020-01-01T00:00:00.000Z'
  });
  assert.equal(registry.ingest(expired).record.valid_until, '2021-01-01T00:00:00.000Z');

  // Self-declared records carry no proof and are unaffected; an attested one with a proof is checked.
  assert.equal(registry.ingest({ record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'receive', profile: 'self_declared' }).record.profile, 'self_declared');
  assert.throws(() => registry.ingest({ record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'receive', profile: 'operator_attested', proof: { bogus: true } }), /proof does not verify/);
  assert.equal(registry.verifyChain().verified, true);
});
