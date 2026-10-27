/**
 * Two registries anchor each other, and a rewrite is detected.
 *
 *   node examples/two-registries.mjs
 *
 * Both registries run in this process on local ports with their own keys. A node
 * (also just a key here) submits a signed envelope to registry A; B anchors A; A
 * anchors B; A grows and B anchors again; then A's operator "restores" A from a
 * different history under the same key, and B's next anchor records a conflict.
 */

import { InMemoryStateRegistry } from "../src/index.js";
import { startStateStackServer } from "../src/server.js";
import { PAYLOAD_PROFILES, createEnvelope, generateEd25519KeyPair } from "@iricity/frontier-shared";

const log = (line) => process.stdout.write(`${line}\n`);
const checks = [];
const check = (name, ok, detail = "") => { checks.push(ok); log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`); };

async function serve(registry) {
  const server = await startStateStackServer({ port: 0, host: "127.0.0.1", registry });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const keyA = generateEd25519KeyPair();
const keyB = generateEd25519KeyPair();
const node = generateEd25519KeyPair();
let registryA = new InMemoryStateRegistry({ signer: keyA, issuerName: "registry-a" });
const registryB = new InMemoryStateRegistry({ signer: keyB, issuerName: "registry-b" });

registryA.ingestEnvelope(createEnvelope({
  payload: { record_type: "measurement", sensor_id: "sensor-1", measurement_type: "temperature", value: 21.5, timestamp: "2026-10-27T00:00:00Z" },
  payload_type: PAYLOAD_PROFILES.STATE_RECORD,
  signer: node
}));

let a = await serve(registryA);
const b = await serve(registryB);
log(`A ${keyA.did} at ${a.url}`);
log(`B ${keyB.did} at ${b.url}`);

try {
  const first = await post(`${b.url}/demo/anchors`, { url: a.url });
  check("B anchors A's chain (length 1)", first.status === 201 && first.body.anchor.length === 1, JSON.stringify(first.body).slice(0, 120));
  const back = await post(`${a.url}/demo/anchors`, { url: b.url });
  check("A anchors B's chain in return", back.status === 201 && back.body.anchor.peer_did === keyB.did);

  registryA.ingest({ record_type: "measurement", sensor_id: "sensor-1", measurement_type: "temperature", value: 22.0, timestamp: "2026-10-27T00:01:00Z" });
  const second = await post(`${b.url}/demo/anchors`, { url: a.url });
  check("B anchors A again after it grew (length 3) and links the previous anchor", second.status === 201 && second.body.anchor.length === 3 && second.body.anchor.previous_anchor_head === first.body.anchor.head);

  const chainB = await (await fetch(`${b.url}/demo/receipts/verify-chain`)).json();
  check("B's own chain, with the anchors in it, verifies", chainB.verified);

  // A's operator restores A from a different history under the same key.
  await a.close();
  registryA = new InMemoryStateRegistry({ signer: keyA, issuerName: "registry-a" });
  for (let i = 0; i < 4; i += 1) registryA.ingest({ record_type: "measurement", sensor_id: "other", measurement_type: "temperature", value: i, timestamp: "2026-10-27T00:02:00Z" });
  a = await serve(registryA);

  const conflict = await post(`${b.url}/demo/anchors`, { url: a.url });
  check("B refuses the rewritten chain with 409 and records the conflict", conflict.status === 409 && conflict.body.conflict?.anchored_head === second.body.anchor.head, conflict.body.error);
  const conflicts = await (await fetch(`${b.url}/demo/anchors/conflicts`)).json();
  check("the conflict is a receipted record on B", conflicts.conflicts.length === 1 && conflicts.conflicts[0].observed_length === 4);
  const chainAfter = await (await fetch(`${b.url}/demo/receipts/verify-chain`)).json();
  check("B's chain still verifies", chainAfter.verified);
} finally {
  await a.close();
  await b.close();
}

const ok = checks.every(Boolean);
log(`\n${ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}: ${checks.filter(Boolean).length}/${checks.length}`);
process.exit(ok ? 0 : 1);
