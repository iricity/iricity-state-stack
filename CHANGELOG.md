# Changelog

## 0.2.0 - 2026-10-16

- Frontier State Protocol 0.1 draft: identity, authorization, verification; envelope and receipt wire formats; payload profiles; conformance; versioning.
- Six architecture decision records.
- JSON Schemas are the single source for validation; envelope schema; profiles for CCSDS OMM, SatNOGS observations, STAC items and pass predictions.
- Registry signs every receipt into one append-only chain, ingests signed envelopes, verifies bridge receipts.
- Server: GET /spec, GET /schemas/:name, GET /identity, POST /verify/envelope, POST /verify/receipt, receipt chain verification.
- Licenses: Apache-2.0 for code, CC BY 4.0 for the specification.

## 0.1.0

- Canonical record vocabulary, conversion and receipt models, in-memory registry, demo server.
