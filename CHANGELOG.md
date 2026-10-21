# Changelog

## 0.4.0 - 2026-10-21

- `FileStateRegistry`: a durable registry with the in-memory interface. Each accepted submission appends one JSON line with exactly what it added; the log is replayed on start, its header issuer must equal the configured signer, and the chain is verified before serving. Ephemeral signers are refused. A failed ingest leaves neither memory nor the log changed.
- Server: `STATE_REGISTRY_PATH` with `STATE_SIGNING_PRIVATE_KEY` (and optional `STATE_ISSUER_NAME`) runs the durable registry; without them the in-memory demo runs as before. `startStateStackServer` accepts a registry. `GET /identity` reports the persistence mode and log path.
- Exports `FileStateRegistry`, `registryFromEnv`, `startStateStackServer`, `buildStateStackServer`.

## 0.3.0 - 2026-10-17

Review pass over the specification, schemas and reference registry.

- Specification: hash rule stated for every JSON value (strings hash as JSON strings); timestamp form fixed (`Z`, fraction of at most three digits); envelope verification requires all header fields and `envelope_hash`; `receipt_id` derivation, `receipt_hash` and `receipt_version` are normative; `verification_status` must agree with the algorithm; `entity_type` required; identity status set and the authorization rules (transmit needs bands, `lower_hz < upper_hz`, validity order) stated as registry-enforced; `authorization_id` derivation and `scope` documented; payload profiles name the carrier field and the dispatch rule; conformance is vectors version 2 (60 cases, eight suites, zero skipped).
- Schemas: neutral `$id` URNs (`urn:frontier-state-protocol:schema:v0.1:<name>`); timestamp patterns on every time field; receipt schema requires `previous_hash`, `issuer` and `signature_algorithm`, enumerates `receipt_version` and `verification_status`, constrains `receipt_id`; entity carries `payload`; authorization constrains `authorization_id`; envelope constrains the signature value.
- Registry: schema tables are prototype-free (`constructor`, `__proto__` are not record types); semantic rules beyond the schema; the receipt commits to the record exactly as submitted (derived `record_hash` and `subject_id` are attached to the stored copy only); receipt records are accepted only when they verify; envelopes are checked against the envelope schema and wrapped by `payload_type` (opaque payloads never promote to records); bridge artifacts require a protocol receipt that verifies against the conversion record, a normalized record whose hash matches the conversion record, and the summary is recomputed; conversion records get registry receipts; `verifyReceiptById` checks the stored record hash; timelines require a subject.
- Profiles: `toIso` throws on unparseable input instead of substituting the current time, accepts `+hh:mm`, `+hhmm` and `+hh` offsets, truncates fractions to milliseconds; STAC entity records carry the item and require `datetime`; `recordFromEnvelopePayload` dispatches on the profile id.
- Server: `400` for malformed JSON, oversized bodies, invalid records, envelopes and bridge artifacts; `/verify/envelope` reports the schema check; `/demo/timeline` requires `subject_id`; endpoint list includes `/health`; the landing page is titled "State Stack Demo".
- Documentation: ADR 0004 records the schema URN decision; conversion model describes bridge binding; receipt model describes the three chains at a bridge and the exact-record rule; registry model regenerated from the schemas; roadmap marks the Python implementation done; specification license covers all documents under `docs/`.
- Tests: 20 cases covering prototype keys, bridge binding and forged summaries, receipts over the submitted record, per-profile envelope dispatch, semantic rules, timestamp normalisation and HTTP status codes.
- Vendored `@iricity/frontier-shared` 0.3.0.

## 0.2.0 - 2026-10-16

- Frontier State Protocol 0.1 draft: identity, authorization, verification; envelope and receipt wire formats; payload profiles; conformance; versioning.
- Six architecture decision records.
- JSON Schemas are the single source for validation; envelope schema; profiles for CCSDS OMM, SatNOGS observations, STAC items and pass predictions.
- Registry signs every receipt into one append-only chain, ingests signed envelopes, verifies bridge receipts.
- Server: GET /spec, GET /schemas/:name, GET /identity, POST /verify/envelope, POST /verify/receipt, receipt chain verification.
- Licenses: Apache-2.0 for code, CC BY 4.0 for the specification.

## 0.1.0

- Canonical record vocabulary, conversion and receipt models, in-memory registry, demo server.
