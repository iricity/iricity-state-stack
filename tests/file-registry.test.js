import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStateRegistry, REGISTRY_LOG_VERSION, registryFromEnv } from '../src/index.js';
import { startStateStackServer } from '../src/server.js';
import { buildStateBridgeArtifact, createEnvelope, generateEd25519KeyPair } from '@iricity/frontier-shared';

const NODE = { record_type: 'entity', entity_id: 'NODE-1', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' };
const MEASUREMENT = { record_type: 'measurement', sensor_id: 'sensor-1', measurement_type: 'temperature', value: 1, timestamp: '2026-01-01T00:00:01Z' };

function tmpLog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-registry-'));
  return path.join(dir, 'registry', 'log.jsonl');
}

test('a file-backed registry survives a restart with its chain intact', () => {
  const logPath = tmpLog();
  const signer = generateEd25519KeyPair();

  const first = new FileStateRegistry({ path: logPath, signer: signer.private_key_pem, issuerName: 'durable-registry' });
  assert.equal(first.identity().persistence, 'file');
  assert.equal(first.identity().signer_mode, 'configured');
  assert.equal(first.loadedEntries, 0);
  assert.equal(JSON.parse(fs.readFileSync(logPath, 'utf8').split('\n')[0]).log_version, REGISTRY_LOG_VERSION);

  const node = generateEd25519KeyPair();
  const ingested = first.ingest(NODE);
  first.ingest(MEASUREMENT);
  first.ingestEnvelope(createEnvelope({ payload: { ...MEASUREMENT, sensor_id: 'sensor-2' }, payload_type: 'state-record.json/1', signer: node }));
  const bridge = first.ingestBridgeArtifact(buildStateBridgeArtifact({
    event: { event_id: 'evt_file_1', source: 'space_stack_demo', event_type: 'space_observation', timestamp: '2026-01-01T00:00:00Z', payload: { a: 1 } },
    analysis: null,
    receipt: null,
    run: { run_id: 'run_file_1', completed_at: '2026-01-01T00:00:01Z' },
    signer: node
  }));
  assert.equal(first.receipts.length, 5, 'three records, one bridge normalized record, one conversion record');
  assert.equal(first.verifyChain().verified, true);

  // A failing ingest leaves neither memory nor the log changed.
  assert.throws(() => first.ingest({ record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'transmit' }), /at least one band/);
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 1 + 4, 'header plus one entry per accepted submission');
  assert.equal(first.receipts.length, 5);

  const reopened = new FileStateRegistry({ path: logPath, signer: signer.private_key_pem, issuerName: 'durable-registry' });
  assert.equal(reopened.loadedEntries, 4);
  assert.equal(reopened.identity().did, signer.did);
  assert.equal(reopened.identity().receipt_count, 5);
  assert.equal(reopened.identity().chain_head, first.identity().chain_head);
  assert.deepEqual(reopened.listReceipts(), first.listReceipts());
  assert.deepEqual(reopened.list(), first.list());
  assert.equal(reopened.bridgeSummary().total, 1);
  assert.equal(reopened.getBridgeArtifactById(bridge.bridge.bridge_id).summary.source_event_id, 'evt_file_1');
  assert.equal(reopened.verifyReceiptById(ingested.receipt.receipt_id).verified, true);
  const chain = reopened.verifyChain();
  assert.equal(chain.verified, true, chain.errors.join('; '));

  // The chain continues from the loaded head.
  const next = reopened.ingest({ ...NODE, entity_id: 'NODE-2' });
  assert.equal(next.receipt.previous_hash, first.identity().chain_head);
  assert.equal(new FileStateRegistry({ path: logPath, signer: signer.private_key_pem }).receipts.length, 6);
});

test('a log is bound to its issuer and refuses tampering, foreign keys and ephemeral identities', () => {
  const logPath = tmpLog();
  const signer = generateEd25519KeyPair();
  const registry = new FileStateRegistry({ path: logPath, signer: signer.private_key_pem });
  registry.ingest(NODE);
  registry.ingest(MEASUREMENT);

  assert.throws(() => new FileStateRegistry({ path: logPath, signer: generateEd25519KeyPair().private_key_pem }), /was written by/);
  assert.throws(() => new FileStateRegistry({ path: logPath }), /durable identity/);
  assert.throws(() => new FileStateRegistry({ signer: signer.private_key_pem }), /log path/);

  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const entry = JSON.parse(lines[1]);
  entry.receipts[0].timestamp = '2026-01-01T00:00:09Z';
  fs.writeFileSync(logPath, [lines[0], JSON.stringify(entry), lines[2]].join('\n') + '\n');
  assert.throws(() => new FileStateRegistry({ path: logPath, signer: signer.private_key_pem }), /failed verification/);

  fs.writeFileSync(logPath, lines[0] + '\n' + '{not json\n');
  assert.throws(() => new FileStateRegistry({ path: logPath, signer: signer.private_key_pem }), /unreadable/);

  fs.writeFileSync(logPath, JSON.stringify({ log_version: 'state-registry-log/0', issuer: signer.did }) + '\n');
  assert.throws(() => new FileStateRegistry({ path: logPath, signer: signer.private_key_pem }), /this registry reads/);
});

test('the server runs on a file-backed registry when the environment names one', async () => {
  const logPath = tmpLog();
  const signer = generateEd25519KeyPair();
  assert.equal(registryFromEnv({}), null);
  assert.throws(() => registryFromEnv({ STATE_REGISTRY_PATH: logPath }), /STATE_SIGNING_PRIVATE_KEY/);

  const registry = registryFromEnv({ STATE_REGISTRY_PATH: logPath, STATE_SIGNING_PRIVATE_KEY: signer.private_key_pem, STATE_ISSUER_NAME: 'env-registry' });
  const server = await startStateStackServer({ port: 0, host: '127.0.0.1', registry });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const identity = await (await fetch(`${baseUrl}/identity`)).json();
    assert.equal(identity.did, signer.did);
    assert.equal(identity.persistence, 'file');
    assert.equal(identity.issuer_name, 'env-registry');
    assert.equal(identity.receipt_count, 0, 'a durable registry starts empty, not with demo seeds');

    const res = await fetch(`${baseUrl}/demo/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(MEASUREMENT) });
    assert.equal(res.status, 201);
    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(health.identity.receipt_count, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const reopened = new FileStateRegistry({ path: logPath, signer: signer.private_key_pem });
  assert.equal(reopened.receipts.length, 1);
});
