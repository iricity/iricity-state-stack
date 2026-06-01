import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashRecord, createReceipt, InMemoryStateRegistry } from '../src/index.js';

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

