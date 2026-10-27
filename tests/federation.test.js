import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStateRegistry, anchorRegistry, buildChainHeadEnvelope, discoverNode, listAnchors, listConflicts, listNodes } from '../src/index.js';
import { startStateStackServer } from '../src/server.js';
import { PAYLOAD_PROFILES, createEnvelope, generateEd25519KeyPair, verifyEnvelope } from '@iricity/frontier-shared';

const NODE_KEY = generateEd25519KeyPair();

function descriptorEnvelope({ did = NODE_KEY.did, signer = NODE_KEY, publicUrl = 'http://node.example' } = {}) {
  const descriptor = {
    descriptor_version: 'node-descriptor.json/1',
    node_id: 'node_example',
    did,
    name: 'Example node',
    operator: 'Example Operator',
    jurisdiction: 'IN',
    site: { latitude: 28.6139, longitude: 77.209, altitude_m: 216 },
    public_url: publicUrl,
    endpoints: { identity: `${publicUrl}/identity`, passes: `${publicUrl}/passes`, receipts: `${publicUrl}/receipts` },
    protocol: { envelope: 'state-envelope/1', receipt: 'state-receipt/1', profiles: ['pass-prediction.json/1'] },
    generated_at: '2026-10-27T00:00:00.000Z'
  };
  return createEnvelope({ payload: descriptor, payload_type: PAYLOAD_PROFILES.NODE_DESCRIPTOR, signer });
}

/** A fetch stub serving a node descriptor and a registry's public routes. */
function fetchFor(routes) {
  return async (url) => {
    const key = [...Object.keys(routes)].find((prefix) => String(url).startsWith(prefix));
    if (!key) return { ok: false, status: 404, text: async () => '{}' };
    const body = typeof routes[key] === 'function' ? routes[key]() : routes[key];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
}

async function withServer(registry, fn) {
  const server = await startStateStackServer({ port: 0, host: '127.0.0.1', registry });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('a registry discovers a node from its signed descriptor and refuses descriptors that do not bind to their signer', async () => {
  const registry = new InMemoryStateRegistry();
  const fetchImpl = fetchFor({ 'http://node.example/.well-known/frontier-node.json': descriptorEnvelope() });

  const discovered = await discoverNode(registry, 'http://node.example/', { fetchImpl });
  assert.equal(discovered.node.did, NODE_KEY.did);
  assert.equal(discovered.node.node_id, 'node_example');
  assert.equal(discovered.record.identity_type, 'node');
  assert.equal(discovered.record.public_key_multibase, NODE_KEY.did.slice(8));
  assert.equal(discovered.receipt.signature_algorithm, 'ed25519');
  assert.equal(listNodes(registry).length, 1);
  assert.equal(registry.verifyChain().verified, true);

  // Re-discovery is receipted again but the directory still lists the node once.
  await discoverNode(registry, 'http://node.example', { fetchImpl });
  assert.equal(listNodes(registry).length, 1);
  assert.equal(registry.receipts.length, 2);

  const impostor = generateEd25519KeyPair();
  const forged = fetchFor({ 'http://evil.example/.well-known/frontier-node.json': descriptorEnvelope({ did: NODE_KEY.did, signer: impostor, publicUrl: 'http://evil.example' }) });
  await assert.rejects(() => discoverNode(registry, 'http://evil.example', { fetchImpl: forged }), /descriptor envelope rejected/);
  const wrongType = fetchFor({ 'http://odd.example/.well-known/frontier-node.json': createEnvelope({ payload: { a: 1 }, payload_type: 'opaque.json/1', signer: NODE_KEY }) });
  await assert.rejects(() => discoverNode(registry, 'http://odd.example', { fetchImpl: wrongType }), /descriptor rejected/);
  await assert.rejects(() => discoverNode(registry, 'ftp://node.example', { fetchImpl }), /http or https/);
  await assert.rejects(() => discoverNode(registry, 'http://missing.example', { fetchImpl }), /answered 404/);
  assert.equal(listNodes(registry).length, 1, 'nothing forged entered the directory');
});

test('registries anchor each other, and a rewritten peer chain is recorded as a conflict and refused', async () => {
  const a = new InMemoryStateRegistry({ signer: generateEd25519KeyPair(), issuerName: 'registry-a' });
  const b = new InMemoryStateRegistry({ signer: generateEd25519KeyPair(), issuerName: 'registry-b' });
  a.ingestEnvelope(descriptorEnvelope());
  a.ingest({ record_type: 'measurement', sensor_id: 's', measurement_type: 't', value: 1, timestamp: '2026-01-01T00:00:00Z' });

  const headA = buildChainHeadEnvelope(a);
  assert.equal(headA.payload_type, 'chain-head.json/1');
  assert.equal(headA.payload.length, 2);
  assert.equal(verifyEnvelope(headA, { expected_signer: a.identity().did }).verified, true);

  const peerA = () => fetchFor({ 'http://a.example/chain/head': () => buildChainHeadEnvelope(a), 'http://a.example/demo/receipts': () => ({ receipts: a.listReceipts() }) });
  const peerB = () => fetchFor({ 'http://b.example/chain/head': () => buildChainHeadEnvelope(b), 'http://b.example/demo/receipts': () => ({ receipts: b.listReceipts() }) });

  const first = await anchorRegistry(b, 'http://a.example', { fetchImpl: peerA() });
  assert.equal(first.anchor.peer_did, a.identity().did);
  assert.equal(first.anchor.length, 2);
  assert.equal(first.anchor.head, a.identity().chain_head);
  assert.equal(first.chain_length_verified, 2);
  assert.equal(b.receipts.length, 1, 'the anchor is receipted into B');
  assert.equal(listAnchors(b)[0].peer_did, a.identity().did);

  // A anchors B in return; a registry never anchors itself.
  const back = await anchorRegistry(a, 'http://b.example', { fetchImpl: peerB() });
  assert.equal(back.anchor.length, 1);
  await assert.rejects(() => anchorRegistry(a, 'http://a.example', { fetchImpl: peerA() }), /does not anchor itself/);

  // A grows; the second anchor records the new head and names the previous one.
  a.ingest({ record_type: 'measurement', sensor_id: 's', measurement_type: 't', value: 2, timestamp: '2026-01-01T00:00:01Z' });
  const second = await anchorRegistry(b, 'http://a.example', { fetchImpl: peerA() });
  assert.equal(second.anchor.length, 4);
  assert.equal(second.anchor.previous_anchor_head, first.anchor.head);
  assert.equal(listAnchors(b, a.identity().did).length, 2);

  // A head that does not match the chain behind it is refused.
  const lying = fetchFor({ 'http://a.example/chain/head': () => createEnvelope({ payload: { ...buildChainHeadEnvelope(a).payload, length: 99 }, payload_type: 'chain-head.json/1', signer: a.signer }), 'http://a.example/demo/receipts': () => ({ receipts: a.listReceipts() }) });
  await assert.rejects(() => anchorRegistry(b, 'http://a.example', { fetchImpl: lying }), /does not match its published head/);

  // A rewrites history: a fresh chain under the same key. B detects that the anchored head is gone.
  const rewritten = new InMemoryStateRegistry({ signer: a.signer, issuerName: 'registry-a' });
  rewritten.ingest({ record_type: 'measurement', sensor_id: 's', measurement_type: 't', value: 'other', timestamp: '2026-01-01T00:00:00Z' });
  rewritten.ingest({ record_type: 'measurement', sensor_id: 's', measurement_type: 't', value: 'other2', timestamp: '2026-01-01T00:00:01Z' });
  for (let i = 0; i < 3; i += 1) rewritten.ingest({ record_type: 'measurement', sensor_id: 's', measurement_type: 't', value: i, timestamp: '2026-01-01T00:00:02Z' });
  const peerRewritten = fetchFor({ 'http://a.example/chain/head': () => buildChainHeadEnvelope(rewritten), 'http://a.example/demo/receipts': () => ({ receipts: rewritten.listReceipts() }) });
  await assert.rejects(() => anchorRegistry(b, 'http://a.example', { fetchImpl: peerRewritten }), (error) => error.status === 409 && /conflict recorded/.test(error.message));
  const conflicts = listConflicts(b);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].anchored_head, second.anchor.head);
  assert.equal(conflicts[0].observed_length, 5);
  assert.equal(b.verifyChain().verified, true, 'the conflict itself is receipted');
  assert.equal(listAnchors(b, a.identity().did).length, 2, 'no new anchor was taken');
});

test('the server exposes the chain head, discovery and anchoring routes', async () => {
  const a = new InMemoryStateRegistry({ signer: generateEd25519KeyPair(), issuerName: 'registry-a' });
  const b = new InMemoryStateRegistry({ signer: generateEd25519KeyPair(), issuerName: 'registry-b' });
  a.ingestEnvelope(descriptorEnvelope());
  await withServer(a, async (urlA) => {
    await withServer(b, async (urlB) => {
      const head = await (await fetch(`${urlA}/chain/head`)).json();
      assert.equal(head.payload.registry_did, a.identity().did);
      assert.equal(head.payload.length, 1);

      const anchored = await fetch(`${urlB}/demo/anchors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: urlA }) });
      const anchoredBody = await anchored.json();
      assert.equal(anchored.status, 201, JSON.stringify(anchoredBody));
      assert.equal(anchoredBody.anchor.length, 1);
      const list = await (await fetch(`${urlB}/demo/anchors`)).json();
      assert.equal(list.anchors.length, 1);
      assert.deepEqual((await (await fetch(`${urlB}/demo/anchors/conflicts`)).json()).conflicts, []);

      const self = await fetch(`${urlA}/demo/anchors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: urlA }) });
      assert.equal(self.status, 409);
      const bad = await fetch(`${urlB}/demo/nodes/discover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'not a url' }) });
      assert.equal(bad.status, 400);
      const nodes = await (await fetch(`${urlA}/demo/nodes`)).json();
      assert.equal(nodes.nodes.length, 1);
      assert.equal(nodes.nodes[0].did, NODE_KEY.did);
      const spec = await (await fetch(`${urlA}/spec`)).json();
      assert.ok(spec.endpoints.anchors);
    });
  });
});
