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
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('serves health, spec, identity and schema discovery', async () => {
  await withServer(async (baseUrl) => {
    const rootRes = await fetch(baseUrl);
    assert.equal(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    assert.match(rootHtml, /State Stack Demo/);
    assert.match(rootHtml, /Bridge summary/);
    assert.match(rootHtml, /Filter bridge summaries/);
    assert.match(rootHtml, /Filtered bridge list/);
    assert.match(rootHtml, /Bridge breakdowns/);
    assert.match(rootHtml, /Recent bridge feed/);
    assert.match(rootHtml, /GET \/demo\/bridges\/summary/);

    const filteredRes = await fetch(`${baseUrl}/demo?source_system=space_stack_demo&bridge_type=state_stack_conversion`);
    assert.equal(filteredRes.status, 200);
    const filteredHtml = await filteredRes.text();
    assert.match(filteredHtml, /source_system:space_stack_demo/);
    assert.match(filteredHtml, /bridge_type:state_stack_conversion/);

    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.service, 'iricity-state-stack');
    assert.match(health.identity.did, /^did:key:z6Mk/);

    const specRes = await fetch(`${baseUrl}/spec`);
    assert.equal(specRes.status, 200);
    const spec = await specRes.json();
    assert.deepEqual(spec.core_modules, ['identity', 'authorization', 'verification']);
    assert.equal(spec.wire_formats.envelope, 'state-envelope/1');
    assert.ok(spec.schemas.profiles.includes('ccsds-omm'));

    const identityRes = await fetch(`${baseUrl}/identity`);
    assert.equal(identityRes.status, 200);
    assert.equal((await identityRes.json()).did, health.identity.did);

    const schemasRes = await fetch(`${baseUrl}/schemas`);
    assert.equal(schemasRes.status, 200);
    const schemas = await schemasRes.json();
    assert.ok(schemas.schemas.includes('entity'));
    assert.ok(schemas.schemas.includes('receipt'));
    assert.ok(schemas.profiles.includes('satnogs-observation'));

    const schemaRes = await fetch(`${baseUrl}/schemas/authorization`);
    assert.equal(schemaRes.status, 200);
    const schema = await schemaRes.json();
    assert.equal(schema.title, 'Authorization');
    assert.ok(schema.properties.capability.enum.includes('transmit'));

    const profileRes = await fetch(`${baseUrl}/schemas/ccsds-omm.schema.json`);
    assert.equal(profileRes.status, 200);
    assert.equal((await fetch(`${baseUrl}/schemas/nope`)).status, 404);
  });
});

test('ingests a record and returns a timeline and a verifiable receipt chain', async () => {
  await withServer(async (baseUrl) => {
    const ingestRes = await postJson(`${baseUrl}/demo/ingest`, {
      record_type: 'measurement',
      sensor_id: 'sensor-demo-1',
      measurement_type: 'temperature',
      value: 24.5,
      unit: 'C',
      timestamp: '2026-01-01T00:00:00Z',
      source: 'demo'
    });

    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.record.record_type, 'measurement');
    assert.equal(ingestBody.receipt.record_type, 'receipt');
    assert.equal(ingestBody.receipt.signature_algorithm, 'ed25519');

    const timelineRes = await fetch(`${baseUrl}/demo/timeline?subject_id=sensor-demo-1`);
    assert.equal(timelineRes.status, 200);
    const timelineBody = await timelineRes.json();
    assert.ok(timelineBody.timeline.some((record) => record.sensor_id === 'sensor-demo-1'));

    const verifyRes = await fetch(`${baseUrl}/demo/receipts/${encodeURIComponent(ingestBody.receipt.receipt_id)}/verify`);
    assert.equal(verifyRes.status, 200);
    const verification = await verifyRes.json();
    assert.equal(verification.verified, true, verification.errors.join(', '));
    assert.ok(verification.checks.includes('signature_valid'));

    const chainRes = await fetch(`${baseUrl}/demo/receipts/verify-chain`);
    assert.equal(chainRes.status, 200);
    const chain = await chainRes.json();
    assert.equal(chain.verified, true, chain.errors.join(', '));
    assert.ok(chain.length >= 5, 'demo registry seeds identity, authorization, navigation, entity and bridge receipts');

    const invalidRes = await postJson(`${baseUrl}/demo/ingest`, { record_type: 'authorization', subject_id: 's', controller_id: 'c', capability: 'fly' });
    assert.equal(invalidRes.status, 400);
  });
});

test('verifies envelopes and receipts submitted by anyone, and ingests signed envelopes', async () => {
  await withServer(async (baseUrl) => {
    const node = generateEd25519KeyPair();
    const payload = { record_type: 'entity', entity_id: 'node_x', entity_type: 'node', created_at: '2026-01-01T00:00:00Z' };
    const envelope = createEnvelope({ payload, payload_type: 'state-record.json/1', signer: node });

    const okRes = await postJson(`${baseUrl}/verify/envelope`, envelope);
    assert.equal((await okRes.json()).verified, true);

    const badRes = await postJson(`${baseUrl}/verify/envelope`, { ...envelope, payload: { ...payload, entity_id: 'other' } });
    assert.equal((await badRes.json()).verified, false);

    const wrongSignerRes = await postJson(`${baseUrl}/verify/envelope`, { envelope, expected_signer: generateEd25519KeyPair().did });
    assert.equal((await wrongSignerRes.json()).verified, false);

    const receipt = createReceiptRecord({ record: payload, issuer: node });
    const receiptRes = await postJson(`${baseUrl}/verify/receipt`, { receipt, record: payload });
    const receiptBody = await receiptRes.json();
    assert.equal(receiptBody.verified, true, receiptBody.errors.join(', '));
    assert.equal(receiptBody.identity_bound, true);

    const ingestRes = await postJson(`${baseUrl}/demo/ingest-envelope`, envelope);
    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.record.entity_id, 'node_x');
    assert.equal(ingestBody.record.signer, node.did);

    const rejectRes = await postJson(`${baseUrl}/demo/ingest-envelope`, { ...envelope, signer: generateEd25519KeyPair().did });
    assert.equal(rejectRes.status, 400);
  });
});

test('ingests and queries bridge artifacts', async () => {
  await withServer(async (baseUrl) => {
    const bridgeArtifact = buildStateBridgeArtifact({
      event: {
        event_id: 'evt_server_bridge_1',
        source: 'space_stack_demo',
        event_type: 'space_observation',
        timestamp: '2026-01-01T00:00:00Z',
        payload: { note: 'server bridge demo' }
      },
      analysis: { analysis_id: 'ana_server_bridge_1' },
      receipt: null,
      run: { run_id: 'run_server_bridge_1', completed_at: '2026-01-01T00:00:01Z' }
    });

    const ingestRes = await postJson(`${baseUrl}/demo/bridge-ingest`, bridgeArtifact);
    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.bridge.bridge_type, 'state_stack_conversion');
    assert.equal(ingestBody.bridge.summary.source_event_id, 'evt_server_bridge_1');

    const bridgesRes = await fetch(`${baseUrl}/demo/bridges`);
    const bridgesBody = await bridgesRes.json();
    assert.ok(bridgesBody.bridges.some((bridge) => bridge.bridge_id === ingestBody.bridge.bridge_id));

    const summaryRes = await fetch(`${baseUrl}/demo/bridges/summary`);
    const summaryBody = await summaryRes.json();
    assert.equal(summaryBody.total >= 1, true);
    assert.equal(summaryBody.by_bridge_type.state_stack_conversion >= 1, true);

    const bridgeByIdRes = await fetch(`${baseUrl}/demo/bridges/${encodeURIComponent(ingestBody.bridge.bridge_id)}`);
    assert.equal(bridgeByIdRes.status, 200);
    const bridgeByIdBody = await bridgeByIdRes.json();
    assert.equal(bridgeByIdBody.summary.bridge_id, ingestBody.bridge.bridge_id);
    assert.equal(bridgeByIdBody.conversion_record.record_type, 'conversion');

    const filteredRes = await fetch(`${baseUrl}/demo/bridges?source_system=space_stack_demo&bridge_type=state_stack_conversion`);
    const filteredBody = await filteredRes.json();
    assert.equal(filteredBody.source_system, 'space_stack_demo');
    assert.ok(filteredBody.bridges.every((bridge) => bridge.source_system === 'space_stack_demo'));
  });
});
