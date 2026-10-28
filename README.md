# state-stack

Specification home and reference registry for the Frontier State Protocol (FSP): a small, verifiable way to say which machine actor is speaking, what it may do, and that a payload or a sequence of accepted records has not been altered.

- **Specification:** [docs/spec/protocol-v0.1.md](docs/spec/protocol-v0.1.md) (CC BY 4.0). The JSON Schemas in [schemas/](schemas/) are normative.
- **Decisions:** [docs/adr/](docs/adr/) explains why the protocol has the shape it has.
- **Primitives and conformance vectors:** `@iricity/frontier-shared` (Apache-2.0).
- **This repository:** reference in-memory registry, payload profiles, demo server (Apache-2.0).

## The three core modules

| Module | Object | What it answers |
| --- | --- | --- |
| Identity | `entity` record with `identity_type` and `did` | Which actor is this? (`did:key`, ed25519) |
| Authorization | `authorization` record | What may it do, where, on which bands, under whose authority, until when? |
| Verification | signed envelope `state-envelope/1`, receipt `state-receipt/1` | Did this actor produce this payload? Has this registry's log been altered? |

Discovery and scheduling are adapters to existing networks (SatNOGS first), not protocol modules. See ADR 0006.

## Standard payloads, wrapped unchanged

| Profile | Standard | Record |
| --- | --- | --- |
| `ccsds.omm.json/1` | CCSDS Orbit Mean-Elements Message (CelesTrak/Space-Track JSON) | `navigation` |
| `satnogs.observation.json/1` | SatNOGS Network observation | `measurement` |
| `stac.item.json/1` | STAC Item | `entity` (`data_product`) |
| `pass-prediction.json/1` | SGP4 pass prediction | `time` (`predicted_pass`) |

The payload is never rewritten. Records carry it plus its hash, the profile id, and the few fields a registry indexes.

## Canonical record types

entity, authorization, time, navigation, measurement, communication, command, resource, constraint, conversion, transition, receipt. Each has a JSON Schema in `schemas/`; the validator loads those files directly, so the schema in the repository is the one that runs. The few rules a schema cannot express (a transmit authorization needs bands, identity status values, a receipt record must verify) are enforced by the registry and listed in the specification.

## Run it

```bash
npm install
npm test
npm start          # http://127.0.0.1:8787
npm run spec       # print the machine-readable protocol description
```

Endpoints:

| Route | Purpose |
| --- | --- |
| `GET /health` | liveness, registry identity, chain length |
| `GET /spec` | protocol description, schema index, registry identity |
| `GET /schemas`, `GET /schemas/:name` | schema discovery and the schema documents |
| `GET /identity` | the registry's `did:key` and signer mode |
| `POST /verify/envelope` | verify any `state-envelope/1` object (body: the envelope, or `{envelope, payload, expected_signer, allowed_payload_types}`); the result includes a schema check |
| `POST /verify/receipt` | verify any `state-receipt/1` object (body: `{receipt, record, previous_receipt, expected_issuer}`) |
| `POST /demo/ingest` | ingest a canonical record; returns the record and a signed receipt over the record exactly as sent (`400` when it does not validate) |
| `POST /demo/ingest-envelope` | ingest a signed envelope; wrapped by its `payload_type`; rejected unless it verifies and matches the envelope schema |
| `POST /demo/bridge-ingest` | ingest an applied-stack bridge artifact; its receipt must verify against the conversion record and the normalized record must match the conversion hash; the summary is recomputed, never trusted |
| `GET /demo/receipts`, `/demo/receipts/verify-chain`, `/demo/receipts/:id/verify` | the registry's append-only receipt chain |
| `GET /demo/records`, `/demo/timeline?subject_id=`, `/demo/bridges…` | inspection |
| `GET /chain/head` | this registry's signed chain head (`chain-head.json/1`) |
| `POST /demo/nodes/discover {url}`, `GET /demo/nodes` | discover a node from its signed descriptor at `/.well-known/frontier-node.json`; the directory |
| `POST /demo/anchors {url}`, `GET /demo/anchors`, `GET /demo/anchors/conflicts` | anchor a peer registry after verifying its whole chain; anchors and detected rewrites |
| `GET /`, `/demo` | landing page with bridge summaries |

The registry signs every receipt. Without a configured signer it generates an ephemeral key at start and reports `signer_mode: "ephemeral"`; pass `new InMemoryStateRegistry({ signer })` to use durable key material.

## Two registries

`node examples/two-registries.mjs` starts two registries with their own keys, has them anchor each other, grows one, anchors again, then restores it from a different history under the same key and shows the other registry recording the conflict and refusing to anchor. See ADR 0007 and ADR 0008.

## Durable registry

`FileStateRegistry` is the in-memory registry plus an append-only log on disk: one JSON line per accepted submission holding exactly the records, receipts, conversions and bridges it added, never rewritten. On start the log is replayed, the issuer in the header must equal the configured signer, and the receipt chain is verified before the registry serves anything. An ephemeral signer is refused, because a durable log needs a durable identity.

```bash
STATE_REGISTRY_PATH=data/registry.jsonl \
STATE_SIGNING_PRIVATE_KEY="$(cat registry-key.pem)" \
STATE_ISSUER_NAME=my-registry \
npm start
```

Generate a key with `node -e "import('@iricity/frontier-shared').then(m => console.log(m.generateEd25519KeyPair().private_key_pem))"` and keep it outside the repository. A durable registry starts empty, with no demo seeds. Copying the log file copies the registry; `GET /identity` reports `persistence: "file"` and the log path.

## Library use

This package is not published yet; use it from a checkout. Its dependency `@iricity/frontier-shared` is on npm.

```js
import {
  InMemoryStateRegistry,
  navigationRecordFromOmm,
  createEnvelope,
  generateEd25519KeyPair
} from 'iricity-state-stack';

const node = generateEd25519KeyPair();
const navigation = navigationRecordFromOmm(ommFromCelestrak);
const envelope = createEnvelope({ payload: navigation, payload_type: 'state-record.json/1', signer: node });

const registry = new InMemoryStateRegistry();
registry.ingestEnvelope(envelope);     // verified, stored, receipted
registry.verifyChain();                // { verified: true, length: 1, head: 'sha256:…' }
```

## Role in the workspace

This repository is below applied domain stacks and above raw data. It holds no product semantics and no runtime assumptions beyond Node 20. Applied stacks (the space stack today; polar, ocean, geo and lunar modules later) produce protocol objects and bridge artifacts; this registry verifies and inspects them.

## Licenses

Code: Apache-2.0 (`LICENSE`). Specification and schemas: CC BY 4.0 (`docs/SPEC-LICENSE.md`).
