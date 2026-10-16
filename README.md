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

entity, authorization, time, navigation, measurement, communication, command, resource, constraint, conversion, transition, receipt. Each has a JSON Schema in `schemas/`; the validator loads those files directly, so code and spec cannot drift.

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
| `GET /spec` | protocol description, schema index, registry identity |
| `GET /schemas`, `GET /schemas/:name` | schema discovery and the schema documents |
| `GET /identity` | the registry's `did:key` and signer mode |
| `POST /verify/envelope` | verify any `state-envelope/1` object (body: the envelope, or `{envelope, payload, expected_signer}`) |
| `POST /verify/receipt` | verify any `state-receipt/1` object (body: `{receipt, record, previous_receipt, expected_issuer}`) |
| `POST /demo/ingest` | ingest a canonical record; returns the record and a signed receipt |
| `POST /demo/ingest-envelope` | ingest a signed envelope; rejected unless it verifies |
| `POST /demo/bridge-ingest` | ingest an applied-stack bridge artifact; its receipt must verify |
| `GET /demo/receipts`, `/demo/receipts/verify-chain`, `/demo/receipts/:id/verify` | the registry's append-only receipt chain |
| `GET /demo/records`, `/demo/timeline?subject_id=`, `/demo/bridges…` | inspection |
| `GET /`, `/demo` | landing page with bridge summaries |

The registry signs every receipt. Without a configured signer it generates an ephemeral key at start and reports `signer_mode: "ephemeral"`; pass `new InMemoryStateRegistry({ signer })` to use durable key material.

## Library use

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
