# Specification

This directory is the specification home. The JSON Schemas in `/schemas` are normative; the prose explains them.

- [protocol-v0.1.md](protocol-v0.1.md): the protocol, three core modules (identity, authorization, verification), two wire formats (envelope, receipt), payload profiles, conformance, versioning.
- `/schemas/*.schema.json`: the twelve canonical record types plus the signed envelope.
- `/schemas/profiles/*.schema.json`: the standard payloads the protocol wraps unchanged.
- [../adr](../adr): the decisions behind the shape of the protocol.

Reference primitives and conformance vectors: `@iricity/frontier-shared`.
Reference registry and demo server: this repository (`npm start`, then `GET /spec`).

Specification text and schemas are licensed CC BY 4.0 (see `../SPEC-LICENSE.md`). Code is Apache-2.0.
