import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashRecord, createReceipt, InMemoryStateRegistry } from '../src/index.js';
import { buildStateBridgeArtifact } from '@iricity/frontier-shared';

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

test('createReceipt returns a deterministic receipt shape', () => {
  const receipt = createReceipt({ record_type: 'entity', entity_id: 'NODE-1', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' });
  assert.equal(receipt.record_type, 'receipt');
  assert.equal(receipt.verification_status, 'issued');
  assert.ok(receipt.record_hash);
});

test('registry ingests and timelines records', () => {
  const registry = new InMemoryStateRegistry();
  registry.ingest({
    record_type: 'entity',
    entity_id: 'NODE-1',
    entity_type: 'node',
    created_at: '2026-01-01T00:00:00Z'
  });

  const timeline = registry.timeline('NODE-1');
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].entity_id, 'NODE-1');
});

test('registry ingests bridge artifacts and exposes bridge summaries', () => {
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
});
