# Frontier State Protocol (FSP), version 0.1 (draft)

Status: draft for implementation. Name proposed, pending trademark and domain checks; see ADR 0004.
Specification license: CC BY 4.0. Reference code license: Apache-2.0.

## 1. Purpose

The protocol lets independent parties state three things about machines, data and actions in a form anyone can verify offline:

1. **Identity.** Which actor is speaking, by public key.
2. **Authorization.** What that actor may do, where, on which bands, under whose authority, for how long.
3. **Verification.** That a given payload was produced by that actor at that time, and that a sequence of accepted records has not been altered.

Everything else a space coordination layer eventually needs (discovery, scheduling, data exchange, compliance checks, accounting, federation) is built from these three and is deliberately out of scope for 0.1. See section 9.

## 2. Design rules

- **Wrap, never restate.** External standard payloads (CCSDS OMM, SatNOGS observations, STAC items) travel unchanged inside protocol objects. The protocol adds identity, time and hashes around them. It never redefines their fields.
- **Verify offline.** Every object carries what is needed to verify it. Signers are `did:key` identifiers, so the public key is in the identifier.
- **One canonical form.** All hashes and signatures are over RFC 8785 canonical JSON. Two implementations must produce identical bytes; the conformance vectors check this.
- **Honest about strength.** Unsigned objects say they are unsigned. A hash is never presented as a signature.
- **Small core.** Version 0.1 can be implemented in a few hundred lines in any language with SHA-256 and Ed25519.

## 3. Primitives

| Primitive | Definition |
| --- | --- |
| Canonical JSON | RFC 8785. Object members sorted by UTF-16 code units, ECMAScript number formatting, no whitespace. Integers outside the IEEE-754 safe range are serialised as the nearest double, as RFC 8785 requires; implementations in languages with big integers must do the same. Non-finite numbers and depths beyond 256 are rejected. |
| Hash reference | `sha256:` followed by 64 lowercase hex characters, over the UTF-8 bytes of the canonical JSON of the value. The rule applies to every JSON value, including strings: the hash of the string `abc` is the hash of the four bytes `"abc"`, not of the three bytes `abc`. A hash over raw text or bytes is a different primitive and is never used in a protocol object. |
| Identity | `did:key` per the W3C did:key method with the ed25519-pub multicodec (`0xed 0x01`), base58btc, multibase prefix `z`. All such identifiers start `did:key:z6Mk`. A `did:key` with any other multicodec is not a valid signer or issuer in 0.1. |
| Signature | Ed25519 (RFC 8032) over UTF-8 bytes, encoded base64url without padding: exactly 86 characters from `A-Z a-z 0-9 - _`. Verifiers reject any other encoding (padding, standard base64, hex) rather than normalising it. |
| Time | ISO-8601 UTC: `YYYY-MM-DDTHH:MM:SS`, an optional fraction of one to three digits, and a `Z` suffix. Producers emit millisecond precision. No offsets, no fractions longer than three digits. Protocol objects with any other timestamp form do not verify. |

## 4. Signed envelope (`state-envelope/1`)

An envelope attaches an identity to any payload.

```json
{
  "envelope_version": "state-envelope/1",
  "payload_type": "ccsds.omm.json/1",
  "payload_hash": "sha256:…",
  "signer": "did:key:z6Mk…",
  "created_at": "2026-10-16T00:00:00.000Z",
  "previous_envelope_hash": null,
  "envelope_hash": "sha256:…",
  "envelope_id": "env_…",
  "payload": { "…unchanged payload…" },
  "signature": { "algorithm": "ed25519", "key_id": "did:key:z6Mk…", "value": "base64url" }
}
```

**Header.** The six fields `envelope_version`, `payload_type`, `payload_hash`, `signer`, `created_at`, `previous_envelope_hash`.

**Signing input.** The string `state-envelope/1:` followed by the canonical JSON of the header. The domain tag prevents an envelope signature from being replayed as any other kind of signature.

**Derived fields.** `envelope_hash` is the hash reference of the signing input. `envelope_id` is `env_` plus the first 24 hex characters of that hash.

**Detached mode.** `payload` may be omitted. The envelope still verifies; a verifier that later obtains the payload checks it against `payload_hash`.

**Chaining.** `previous_envelope_hash` links to an earlier envelope's `envelope_hash`, or is null.

**Verification.** An envelope is valid when: all six header fields are present (`previous_envelope_hash` may be null); the version is `state-envelope/1`; `created_at` has the time form of section 3; the signer is a `did:key` ed25519 identifier; the payload, when present, hashes to `payload_hash`; `envelope_hash` is present and matches; `envelope_id`, when present, matches; the signature value has the form of section 3 and verifies against the signer's key over the signing input; `signature.key_id`, when present, equals the signer. A verifier may additionally restrict `payload_type` to an allowed list and `signer` to an expected identity. A verifier never throws on malformed input; it returns a result with errors.

## 5. Receipt (`state-receipt/1`)

A receipt proves that an issuer accepted a specific record at a specific time, linked to the issuer's previous receipt. A registry's receipts form one append-only chain.

```json
{
  "record_type": "receipt",
  "receipt_version": "state-receipt/1",
  "receipt_id": "rcp_…",
  "record_hash": "sha256:…",
  "previous_hash": "sha256:… or null",
  "timestamp": "2026-10-16T00:00:00.000Z",
  "issuer": "did:key:z6Mk…",
  "receipt_hash": "sha256:…",
  "signature": "base64url",
  "signature_algorithm": "ed25519",
  "key_id": "did:key:z6Mk…",
  "verification_status": "issued"
}
```

**Core.** `receipt_id`, `record_hash`, `previous_hash`, `timestamp`, `issuer`. All five are required; `previous_hash` is null at genesis.

**Identifiers (normative).** `receipt_id` is `rcp_` plus the first 24 hex characters of the SHA-256 of the canonical JSON of `{record_hash, previous_hash, timestamp, issuer}`. A receipt whose `receipt_id` does not equal this derivation is invalid: an issuer cannot choose ids. `receipt_hash` is the hash reference of the core and is required; a receipt without it, or whose `receipt_hash` does not match, is invalid. `receipt_version` is required and equals `state-receipt/1` for every receipt produced under this specification (it is absent only on pre-0.1 `sha256_chain_legacy` receipts).

**Signing input.** `state-receipt/1:` followed by the canonical JSON of the core.

**Signature algorithms.**

| `signature_algorithm` | Meaning |
| --- | --- |
| `ed25519` | issuer is a `did:key`; publicly verifiable |
| `sha256_chain_legacy` | pre-0.1 chain digest `sha256(record_hash\|previous_hash\|issuer\|timestamp)`; integrity only |
| `none` | hash only; `verification_status` is `unsigned` |

**Status consistency.** `verification_status` is `issued` exactly when `signature_algorithm` is `ed25519` and the signature verifies, and `unsigned` when it is `none`. A receipt whose status and algorithm disagree is invalid. When `issuer` is a `did:key`, it must be an ed25519 `did:key` and, for `ed25519` receipts, `key_id` when present must equal it. An issuer that is not a `did:key` (a plain name) can only produce `none` receipts.

**Receipt verification.** A verifier checks, in this order and without throwing: version supported; core complete; timestamp form; `receipt_id` derivation; `receipt_hash`; status consistency; the signature (for `ed25519`) or the legacy digest (for `sha256_chain_legacy`). When the record is supplied, `record_hash` must equal its hash reference; when the previous receipt is supplied, `previous_hash` must equal its `receipt_hash`; when an expected issuer is supplied, `issuer` must equal it.

**Chain verification.** Receipts are verified oldest first. Each receipt's `previous_hash` must equal the preceding receipt's `receipt_hash`. A chain may be required to start with `previous_hash` null (genesis) and to have a single expected issuer. An empty list is not a chain.

**Receipts as records.** A receipt may itself be stored as a record (`record_type: receipt`). A registry accepts a receipt record only if it verifies; it never issues a receipt over a receipt it cannot verify.

## 6. Core records

Records use the canonical state-record vocabulary. The JSON Schemas in `/schemas` are normative; the summaries below name the fields that carry protocol meaning.

### 6.1 Identity (record_type `entity`)

An entity with `identity_type` and `did` is an identity record.

| Field | Meaning |
| --- | --- |
| `entity_id` | stable local identifier |
| `entity_type` | required for every entity: the kind of thing (`node`, `satellite`, `data_product`, `space_event`, …) |
| `identity_type` | `organization`, `operator`, `node`, `ground_station`, `satellite`, `sensor`, `agent`, `service` |
| `did` | the actor's `did:key`, or null for actors without keys yet |
| `public_key_multibase` | the multibase part of the did, for consumers that want the raw key |
| `controller_id` | the entity responsible for this one (an operator for a node, an organization for an operator) |
| `status` | lifecycle: `active`, `suspended`, `revoked`, `superseded` |
| `created_at` | required; time form of section 3 |

The status set applies to identity records only; entities without `identity_type` may use domain statuses. The schema types `status` as a string; a registry enforces the identity set on ingest.

### 6.2 Authorization (record_type `authorization`)

Shaped like a license so a regulator-issued credential maps onto it without loss.

| Field | Meaning |
| --- | --- |
| `authorization_id` | `auth_` plus the first 24 hex characters of the hash of the record without `authorization_id` (the fields below, in canonical form). Derived, so the same claim always has the same id. |
| `subject_id` | who is authorized |
| `controller_id` | who asserts it (the issuer) |
| `capability` | `receive`, `transmit`, `command`, `schedule`, `publish_data`, `relay` |
| `scope` | free text narrowing the capability (for example `receive_only_no_transmit`); the protocol does not interpret it |
| `profile` | `self_declared`, `operator_attested`, `regulator_issued` |
| `jurisdiction` | ISO 3166-1 alpha-2 |
| `bands` | list of `{lower_hz, upper_hz, service}`; required for `transmit` |
| `max_eirp_dbw` | power ceiling |
| `location` | `{latitude, longitude, altitude_m, radius_km}` |
| `valid_from`, `valid_until`, `revoked` | validity |
| `license_reference`, `proof` | the external license reference and, for `regulator_issued` records, the verifiable credential described below |

Receive-only operation needs no license in most jurisdictions and is the default self-declared authorization for a new node.

Rules a registry enforces on ingest, beyond the schema: a `transmit` authorization declares at least one band; every band has numeric `lower_hz < upper_hz`; `valid_until`, when present with `valid_from`, is not earlier than it; a `regulator_issued` record carries a credential that verifies and is bound to the record (below), and an `operator_attested` record that carries a proof must satisfy the same check. Implementations must refuse to schedule a transmit action that has no current `transmit` authorization covering the band in question.

**Regulator-issued proof.** For `profile: regulator_issued`, `proof` is a W3C Verifiable Credential (Data Model 2.0) issued by the authority, and `controller_id` is the authority's `did:key`. The credential has `@context` starting with `https://www.w3.org/ns/credentials/v2`, `type` including `VerifiableCredential`, `issuer` equal to `controller_id`, `validFrom` and `validUntil` equal to the record's `valid_from` and `valid_until`, and a `credentialSubject` whose `id` is the record's `subject_id` and whose `capability`, `scope`, `jurisdiction`, `bands`, `max_eirp_dbw`, `location` and `license_reference` equal the record's (absent, null and an empty band list are the same). It is secured with a Data Integrity proof of type `DataIntegrityProof`, cryptosuite `eddsa-jcs-2022`, purpose `assertionMethod`, verification method `<issuer did>#<its multibase key>`, and `proofValue` a multibase base58btc Ed25519 signature over `sha256(canonical(proof options with the document's @context)) || sha256(canonical(credential without proof))`, both in the canonical form of section 3. A verifier checks all of this and the validity window at the instant of interest; a registry checks it at the record's `valid_from`, because an expired licence is still an authentic record of what was granted. Revocation is a state of the record (`revoked`), not a defect of the proof. The mapping from one national amateur licence to these fields is in [licence-mapping-example.md](licence-mapping-example.md).

### 6.3 Verification objects

Envelopes (section 4) and receipts (section 5). A registry that accepts records issues receipts; a node that produces data issues envelopes.

## 7. Payload profiles

A `payload_type` names a profile. Version 0.1 defines:

| Profile id | Payload | Wrapped as | Carried in |
| --- | --- | --- | --- |
| `ccsds.omm.json/1` | CCSDS Orbit Mean-Elements Message, JSON key-value form (CelesTrak, Space-Track) | `navigation` record | `payload` |
| `satnogs.observation.json/1` | SatNOGS Network observation object | `measurement` record | `value` |
| `stac.item.json/1` | STAC Item (GeoJSON Feature) | `entity` record of type `data_product` | `payload` |
| `pass-prediction.json/1` | one predicted contact window from SGP4 propagation | `time` record with `window_kind: predicted_pass` | `payload` |
| `state-record.json/1` | a canonical state record itself | the record | the record is the payload |
| `opaque.json/1` | anything else | `measurement` record | `value` |

Every wrapping record also carries `payload_profile` (the profile id) and `payload_hash` (the hash reference of the payload as received). The payload is never rewritten; the wrapping constructor copies it and adds only the fields a registry indexes (identifiers, timestamps in the time form of section 3). A timestamp in the payload that cannot be normalised to that form is an error, never a substituted clock reading.

Profile schemas live in `/schemas/profiles`. They check only what the registry needs to index; full validation belongs to the upstream standard.

**Dispatch on ingest.** A registry that accepts an envelope wraps the payload according to the envelope's `payload_type`, never according to anything inside the payload. In particular, an `opaque.json/1` payload that happens to contain a `record_type` field is still wrapped as a measurement, and a `state-record.json/1` payload must be a valid canonical record of a known type. Unknown profile ids are rejected.

## 8. Conformance

An implementation conforms when it passes every case of the current conformance vectors (version 2, 60 cases) published with the reference primitives (`@iricity/frontier-shared/conformance`, `vectors.json` with a SHA-256 lock file). The suites are:

| Suite | Cases | Pins |
| --- | --- | --- |
| `canonical_json` | 11 | RFC 8785 sample, key ordering, number formatting, unicode, large integers, nesting |
| `hash_payload` | 6 | hash references over objects, arrays, numbers, strings (as JSON strings), null |
| `base58btc` | 5 | multibase encoding and leading-zero handling |
| `did_key` | 3 | ed25519 multicodec framing, round trip |
| `ed25519` | 2 | RFC 8032 tests 1 and 2 |
| `envelope` | 3 | byte-exact signing inputs, hashes, ids and signatures from fixed seeds |
| `receipt` | 4 | byte-exact receipt ids, hashes and signatures, chain links |
| `rejections` | 26 | inputs a verifier must reject: stripped or re-encoded signatures, wrong ids, offsets in timestamps, non-ed25519 keys, status mismatches, tampered payloads |

An implementation that skips a suite is not conformant; the result is `conformant` only with zero failures and zero skipped cases. A new vector version is published whenever a rule is added; implementations state which version they pass.

## 9. Deferred modules

Not part of 0.1, in the order they are expected to arrive:

- **Discovery** (what a node offers) and **scheduling** (booking a pass) are provided by adapters to existing networks, SatNOGS first. See ADR 0006.
- **Data exchange** beyond signed envelopes: DTN Bundle Protocol (RFC 9171) as transport.
- **Compliance engine**: policy-as-code evaluation of authorizations before an action runs.
- **Accounting**: signed, append-only, non-transferable usage records.
- **Federation**: registries exchanging receipts and identities.

## 10. Versioning

Wire formats carry their own version tags (`state-envelope/1`, `state-receipt/1`, profile ids ending `/1`). A breaking change increments the tag; verifiers keep accepting earlier tags. The protocol's working name is not part of any signed byte, so renaming is free until 0.1 is frozen and remains free afterwards.
