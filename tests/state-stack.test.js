import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  createReceipt,
  hashRecord,
  InMemoryStateRegistry,
  validateRecord,
  verifyReceipt
} from '../src/index.js';
import { buildStateBridgeArtifact, generateEd25519KeyPair } from '@iricity/frontier-shared';

test('canonicalJson sorts keys deterministically', () => {
  const a = canonicalJson({ b: 2, a: 1 });
  const b = canonicalJson({ a: 1, b: 2 });
  assert.equal(a, b);
});

test('hashRecord is deterministic', () => {
  const a = hashRecord({ a: 1, b: 2 });
  const b = hashRecord({ b: 2, a: 1 });
  assert.equal(a, b);
});

test('createReceipt is unsigned without a signer and signed with one', () => {
  const record = { record_type: 'entity', entity_id: 'NODE-1', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' };
  const unsigned = createReceipt(record);
  assert.equal(unsigned.record_type, 'receipt');
  assert.equal(unsigned.signature_algorithm, 'none');
  assert.equal(unsigned.verification_status, 'unsigned');
  assert.ok(unsigned.record_hash);

  const signer = generateEd25519KeyPair();
  const signed = createReceipt(record, { signer });
  assert.equal(signed.signature_algorithm, 'ed25519');
  assert.equal(signed.issuer, signer.did);
  assert.equal(signed.verification_status, 'issued');
  assert.equal(verifyReceipt(signed, { record }).verified, true);
});

test('registry ingests and timelines records with a signed, chained receipt log', () => {
  const registry = new InMemoryStateRegistry();
  const identity = registry.identity();
  assert.match(identity.did, /^did:key:z6Mk/);
  assert.equal(identity.signer_mode, 'ephemeral');

  const first = registry.ingest({
    record_type: 'entity',
    entity_id: 'NODE-1',
    entity_type: 'node',
    created_at: '2026-01-01T00:00:00Z'
  });
  const second = registry.ingest({
    record_type: 'measurement',
    sensor_id: 'sensor-1',
    measurement_type: 'temperature',
    value: 1,
    timestamp: '2026-01-01T00:00:01Z'
  });

  assert.equal(first.receipt.previous_hash, null);
  assert.equal(second.receipt.previous_hash, first.receipt.receipt_hash);
  assert.equal(first.receipt.issuer, identity.did);

  const timeline = registry.timeline('NODE-1');
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].entity_id, 'NODE-1');

  const chain = registry.verifyChain();
  assert.equal(chain.verified, true, chain.errors.join(', '));
  assert.equal(chain.length, 2);

  const single = registry.verifyReceiptById(second.receipt.receipt_id);
  assert.equal(single.verified, true, single.errors.join(', '));
  assert.ok(single.checks.includes('record_hash_match'));
  assert.ok(single.checks.includes('previous_link_match'));
});

test('registry accepts a configured signer', () => {
  const signer = generateEd25519KeyPair();
  const registry = new InMemoryStateRegistry({ signer });
  assert.equal(registry.identity().did, signer.did);
  assert.equal(registry.identity().signer_mode, 'configured');
});

test('validator enforces enums, patterns, nested objects and arrays from the JSON schemas', () => {
  assert.equal(validateRecord('entity', { record_type: 'entity', entity_id: 'x', entity_type: 'node', created_at: 'now' }).ok, true);
  assert.deepEqual(
    validateRecord('entity', { record_type: 'entity', entity_type: 'node', created_at: 'now' }).errors,
    ['missing required field: entity_id']
  );
  assert.equal(validateRecord('entity', { record_type: 'entity', entity_id: 'x', entity_type: 'node', created_at: 'now', identity_type: 'spaceship' }).ok, false);
  assert.equal(validateRecord('entity', { record_type: 'entity', entity_id: 'x', entity_type: 'node', created_at: 'now', did: 'did:web:x' }).ok, false);

  const auth = { record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'receive' };
  assert.equal(validateRecord('authorization', auth).ok, true);
  assert.equal(validateRecord('authorization', { ...auth, capability: 'fly' }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, jurisdiction: 'India' }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, bands: [{ lower_hz: 1 }] }).ok, false);
  assert.equal(validateRecord('authorization', { ...auth, bands: [{ lower_hz: 1, upper_hz: 2 }] }).ok, true);
  assert.equal(validateRecord('authorization', { ...auth, location: { latitude: 100, longitude: 0 } }).ok, false);

  assert.equal(validateRecord('receipt', { record_type: 'receipt', receipt_id: 'r', record_hash: 'nope', timestamp: 't' }).ok, false);
  assert.equal(validateRecord('unknown', {}).ok, false);
});

test('registry ingests bridge artifacts, verifies their receipt, and exposes bridge summaries', () => {
  const registry = new InMemoryStateRegistry();
  const artifact = buildStateBridgeArtifact({
    event: {
      event_id: 'evt_bridge_1',
      source: 'space_stack_demo',
      event_type: 'space_observation',
      timestamp: '2026-01-01T00:00:00Z',
      payload: { note: 'bridge demo' }
    },
    analysis: { analysis_id: 'ana_bridge_1' },
    receipt: null,
    run: { run_id: 'run_bridge_1', completed_at: '2026-01-01T00:00:01Z' }
  });

  const result = registry.ingestBridgeArtifact(artifact);
  const bridges = registry.listBridgeArtifacts();

  assert.equal(result.bridge.bridge_type, 'state_stack_conversion');
  assert.equal(result.bridge.receipt_verification.verified, true);
  assert.equal(result.record.record_type, 'entity');
  assert.equal(result.conversion_record.record_type, 'conversion');
  assert.equal(bridges.length, 1);
  assert.equal(bridges[0].bridge_id, result.bridge.bridge_id);
  assert.equal(bridges[0].source_event_id, 'evt_bridge_1');

  const summary = registry.bridgeSummary();
  assert.equal(summary.total, 1);
  assert.equal(summary.by_bridge_type.state_stack_conversion, 1);
  assert.equal(summary.by_source_system.space_stack_demo, 1);
  assert.equal(summary.by_record_type.entity, 1);
  assert.equal(summary.latest_bridge.bridge_id, result.bridge.bridge_id);

  const tampered = { ...artifact, conversion_record: { ...artifact.conversion_record, conversion_rule: 'edited' } };
  assert.throws(() => registry.ingestBridgeArtifact(tampered), /failed verification/);
});
