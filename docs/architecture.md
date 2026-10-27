# Architecture

## Purpose

This repository is the specification home and reference registry for the state protocol. It defines how identities, authorizations, time, navigation, measurements, communications, commands, resources, constraints, conversions, transitions and receipts are represented, and verifies objects produced against that definition.

## Layers

```
applied stacks (space today; polar, ocean, geo, lunar later)
        produce envelopes, records, bridge artifacts
                    │
          this repository: spec + registry
        validates, receipts, inspects, verifies
                    │
   @iricity/frontier-shared: primitives + vectors
  canonical JSON, hashing, did:key, envelope, receipt
```

Nothing above the primitive layer implements hashing, canonicalization or signing itself.

## Components

| Path | Role |
| --- | --- |
| `schemas/*.schema.json` | normative record schemas and the envelope schema |
| `schemas/profiles/*.schema.json` | structural checks for wrapped standard payloads |
| `src/schemas/recordSchemas.js` | loads the schema files; the only schema source |
| `src/utils/validateRecord.js` | dependency-free validator for the schema subset in use |
| `src/profiles/` | constructors that wrap OMM, SatNOGS, STAC and pass predictions into records |
| `src/engine/receiptEngine.js` | receipts via the shared primitive |
| `src/engine/conversionEngine.js` | conversion records with receipts |
| `src/registry/memoryRegistry.js` | reference registry: validate (schema plus the semantic rules), receipt, chain, envelope ingest dispatched by `payload_type`, bridge ingest with binding checks |
| `src/registry/fileRegistry.js` | the same registry over an append-only JSON-lines log: replayed and chain-verified on start, bound to one issuer |
| `src/registry/federation.js` | discovery by node descriptor and anchoring between registries, with the conflict rule (ADR 0007, 0008) |
| `src/protocol.js` | machine-readable protocol description served at `GET /spec` |
| `src/server.js` | demo server and verification endpoints |

## Design rules

- One canonical meaning per field.
- No product semantics in this layer.
- Every accepted record is replayable from its receipt chain.
- External standards are wrapped, not restated (ADR 0003).
- Verification endpoints are open: anyone can check an envelope or receipt without a key.
