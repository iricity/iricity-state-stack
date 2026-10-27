# Specification

This directory is the specification home. The JSON Schemas in `/schemas` are normative; the prose explains them.

- [protocol-v0.1.md](protocol-v0.1.md): the protocol, three core modules (identity, authorization, verification), two wire formats (envelope, receipt), payload profiles, conformance, versioning.
- [licence-mapping-example.md](licence-mapping-example.md): how one national amateur licence becomes a regulator-issued authorization with a verifiable credential.
- `/schemas/*.schema.json`: the twelve canonical record types plus the signed envelope.
- `/schemas/profiles/*.schema.json`: the standard payloads the protocol wraps unchanged.
- [../adr](../adr): the decisions behind the shape of the protocol.

Reference primitives and conformance vectors: `@iricity/frontier-shared`.
Reference registry and demo server: this repository (`npm start`, then `GET /spec`).

## Implementations

| Implementation | Language | Version | Vectors | Status |
| --- | --- | --- | --- | --- |
| `@iricity/frontier-shared` | JavaScript (Node 20+) | 0.5.0 | version 3, 75 of 75, no suite skipped | reference; npm publish pending the 0.1 freeze |
| `iricity-frontier-shared` (Python) | Python 3.10+ | 0.5.0 | version 3, 75 of 75, no suite skipped | portability proof, including credentials; PyPI publish pending the 0.1 freeze |

Both implementations verify objects produced by the other; the vectors pin canonical form, hashes, did:key framing and the exact signing inputs. A conforming third implementation is one that prints `RESULT: conformant` against the same vectors.

Specification text and schemas are licensed CC BY 4.0 (see `../SPEC-LICENSE.md`). Code is Apache-2.0.
