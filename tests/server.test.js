import test from 'node:test';
import assert from 'node:assert/strict';
import { startStateStackServer } from '../src/server.js';
import { buildStateBridgeArtifact, createEnvelope, createReceiptRecord, generateEd25519KeyPair } from '@iricity/frontier-shared';

async function withServer(fn) {
  const server = await startStateStackServer({ port: 0, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(url, body) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

test('serves health, spec, identity and schema discovery', async () => {
  await withServer(async (baseUrl) => {
    const rootRes = await fetch(baseUrl);
    assert.equal(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    assert.match(rootHtml, /State Stack Demo/);
    assert.doesNotMatch(rootHtml, /<title>Iricity/);
    assert.match(rootHtml, /Bridge summary/);
    assert.match(rootHtml, /GET \/demo\/bridges\/summary/);

    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(health.service, 'iricity-state-stack');
    assert.match(health.identity.did, /^did:key:z6Mk/);

    const spec = await (await fetch(`${baseUrl}/spec`)).json();
    assert.deepEqual(spec.core_modules, ['identity', 'authorization', 'verification']);
    assert.equal(spec.wire_formats.envelope, 'state-envelope/1');
    assert.ok(spec.schemas.profiles.includes('ccsds-omm'));
    assert.ok(spec.endpoints.health);

    const identity = await (await fetch(`${baseUrl}/identity`)).json();
    assert.equal(identity.did, health.identity.did);

    const schemas = await (await fetch(`${baseUrl}/schemas`)).json();
    assert.ok(schemas.schemas.includes('entity'));
    assert.ok(schemas.profiles.includes('satnogs-observation'));

    const schema = await (await fetch(`${baseUrl}/schemas/authorization`)).json();
    assert.equal(schema.title, 'Authorization');
    assert.equal((await fetch(`${baseUrl}/schemas/ccsds-omm.schema.json`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/schemas/nope`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/schemas/constructor`)).status, 404, 'prototype names are not schemas');
    assert.equal((await fetch(`${baseUrl}/schemas/__proto__`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/schemas/%E0%A4%A`)).status, 400, 'a malformed path segment is a client error');
  });
});

test('ingests a record and returns a timeline and a verifiable receipt chain', async () => {
  await withServer(async (baseUrl) => {
    const record = { record_type: 'measurement', sensor_id: 'sensor-demo-1', measurement_type: 'temperature', value: 24.5, unit: 'C', timestamp: '2026-01-01T00:00:00Z', source: 'demo' };
    const ingestRes = await postJson(`${baseUrl}/demo/ingest`, record);
    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.receipt.signature_algorithm, 'ed25519');

    const verifyAgainstSubmitted = await postJson(`${baseUrl}/verify/receipt`, { receipt: ingestBody.receipt, record });
    const submittedBody = await verifyAgainstSubmitted.json();
    assert.equal(submittedBody.verified, true, submittedBody.errors.join(', '));

    const timelineRes = await fetch(`${baseUrl}/demo/timeline?subject_id=sensor-demo-1`);
    assert.equal(timelineRes.status, 200);
    assert.ok((await timelineRes.json()).timeline.some((item) => item.sensor_id === 'sensor-demo-1'));
    assert.equal((await fetch(`${baseUrl}/demo/timeline`)).status, 400);

    const verification = await (await fetch(`${baseUrl}/demo/receipts/${encodeURIComponent(ingestBody.receipt.receipt_id)}/verify`)).json();
    assert.equal(verification.verified, true, verification.errors.join(', '));
    assert.ok(verification.checks.includes('signature_valid'));

    const chain = await (await fetch(`${baseUrl}/demo/receipts/verify-chain`)).json();
    assert.equal(chain.verified, true, chain.errors.join(', '));
    assert.ok(chain.length >= 6, 'demo registry seeds identity, authorization, navigation, entity, bridge record and conversion receipts');

    assert.equal((await postJson(`${baseUrl}/demo/ingest`, { record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'fly' })).status, 400);
    assert.equal((await postJson(`${baseUrl}/demo/ingest`, { record_type: 'constructor' })).status, 400);
    assert.equal((await postJson(`${baseUrl}/demo/ingest`, '{bad')).status, 400);
    assert.equal((await postJson(`${baseUrl}/demo/ingest`, { record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'transmit' })).status, 400);
  });
});

test('verifies envelopes and receipts submitted by anyone, and ingests signed envelopes', async () => {
  await withServer(async (baseUrl) => {
    const node = generateEd25519KeyPair();
    const payload = { record_type: 'entity', entity_id: 'node_x', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' };
    const envelope = createEnvelope({ payload, payload_type: 'state-record.json/1', signer: node });

    const ok = await (await postJson(`${baseUrl}/verify/envelope`, envelope)).json();
    assert.equal(ok.verified, true);
    assert.equal(ok.schema.valid, true);

    const bad = await (await postJson(`${baseUrl}/verify/envelope`, { ...envelope, payload: { ...payload, entity_id: 'other' } })).json();
    assert.equal(bad.verified, false);

    const extra = await (await postJson(`${baseUrl}/verify/envelope`, { ...envelope, note: 'x' })).json();
    assert.equal(extra.verified, false, 'an envelope with an extra key fails the schema');
    assert.equal(extra.schema.valid, false);

    const wrongSigner = await (await postJson(`${baseUrl}/verify/envelope`, { envelope, expected_signer: generateEd25519KeyPair().did })).json();
    assert.equal(wrongSigner.verified, false);

    const receipt = createReceiptRecord({ record: payload, issuer: node });
    const receiptBody = await (await postJson(`${baseUrl}/verify/receipt`, { receipt, record: payload })).json();
    assert.equal(receiptBody.verified, true, receiptBody.errors.join(', '));
    assert.equal(receiptBody.identity_bound, true);

    const ingestRes = await postJson(`${baseUrl}/demo/ingest-envelope`, envelope);
    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.record.entity_id, 'node_x');
    assert.equal(ingestBody.record.signer, node.did);

    assert.equal((await postJson(`${baseUrl}/demo/ingest-envelope`, { ...envelope, signer: generateEd25519KeyPair().did })).status, 400);
    assert.equal((await postJson(`${baseUrl}/verify/envelope`, '{bad')).status, 400);
  });
});

test('ingests and queries bridge artifacts, rejecting those that do not bind', async () => {
  await withServer(async (baseUrl) => {
    const bridgeArtifact = buildStateBridgeArtifact({
      event: { event_id: 'evt_server_bridge_1', source: 'space_stack_demo', event_type: 'space_observation', timestamp: '2026-01-01T00:00:00Z', payload: { note: 'server bridge demo' } },
      analysis: { analysis_id: 'ana_server_bridge_1' },
      receipt: null,
      run: { run_id: 'run_server_bridge_1', completed_at: '2026-01-01T00:00:01Z' }
    });

    const ingestRes = await postJson(`${baseUrl}/demo/bridge-ingest`, bridgeArtifact);
    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.bridge.summary.source_event_id, 'evt_server_bridge_1');
    assert.equal(ingestBody.bridge.summary.status, 'unsigned');

    const bridges = await (await fetch(`${baseUrl}/demo/bridges`)).json();
    assert.ok(bridges.bridges.some((bridge) => bridge.bridge_id === ingestBody.bridge.bridge_id));

    const summary = await (await fetch(`${baseUrl}/demo/bridges/summary`)).json();
    assert.ok(summary.total >= 1);

    const byId = await (await fetch(`${baseUrl}/demo/bridges/${encodeURIComponent(ingestBody.bridge.bridge_id)}`)).json();
    assert.equal(byId.summary.bridge_id, ingestBody.bridge.bridge_id);
    assert.equal(byId.conversion_record.record_type, 'conversion');

    const filtered = await (await fetch(`${baseUrl}/demo/bridges?source_system=space_stack_demo&bridge_type=state_stack_conversion`)).json();
    assert.ok(filtered.bridges.every((bridge) => bridge.source_system === 'space_stack_demo'));

    assert.equal((await postJson(`${baseUrl}/demo/bridge-ingest`, { x: 1 })).status, 400);
    const swapped = { ...bridgeArtifact, normalized_record: { record_type: 'entity', entity_id: 'IMPOSTOR', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' } };
    assert.equal((await postJson(`${baseUrl}/demo/bridge-ingest`, swapped)).status, 400);
  });
});
