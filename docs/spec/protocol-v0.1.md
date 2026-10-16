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
| Canonical JSON | RFC 8785. Object members sorted by UTF-16 code units, ECMAScript number formatting, no whitespace. |
| Hash reference | `sha256:` followed by 64 lowercase hex characters, over the UTF-8 bytes of canonical JSON. |
| Identity | `did:key` per the W3C did:key method with the ed25519-pub multicodec (`0xed 0x01`), base58btc, multibase prefix `z`. All such identifiers start `did:key:z6Mk`. |
| Signature | Ed25519 (RFC 8032) over UTF-8 bytes, encoded base64url without padding. |
| Time | ISO-8601 UTC with millisecond precision and a `Z` suffix. |

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

**Verification.** An envelope is valid when: the version is `state-envelope/1`; the signer is a `did:key` ed25519 identifier; the payload, when present, hashes to `payload_hash`; `envelope_hash`, when present, matches; the signature verifies against the signer's key over the signing input; `signature.key_id`, when present, equals the signer.

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

**Core.** `receipt_id`, `record_hash`, `previous_hash`, `timestamp`, `issuer`.

**Identifiers.** `receipt_id` is `rcp_` plus the first 24 hex characters of the SHA-256 of the canonical JSON of `{record_hash, previous_hash, timestamp, issuer}`. `receipt_hash` is the hash reference of the core.

**Signing input.** `state-receipt/1:` followed by the canonical JSON of the core.

**Signature algorithms.**

| `signature_algorithm` | Meaning |
| --- | --- |
| `ed25519` | issuer is a `did:key`; publicly verifiable |
| `sha256_chain_legacy` | pre-0.1 chain digest `sha256(record_hash\|previous_hash\|issuer\|timestamp)`; integrity only |
| `none` | hash only; `verification_status` is `unsigned` |

**Chain verification.** Receipts are verified oldest first. Each receipt's `previous_hash` must equal the preceding receipt's `receipt_hash`. A chain may be required to start with `previous_hash` null (genesis).

## 6. Core records

Records use the canonical state-record vocabulary. The JSON Schemas in `/schemas` are normative; the summaries below name the fields that carry protocol meaning.

### 6.1 Identity (record_type `entity`)

An entity with `identity_type` and `did` is an identity record.

| Field | Meaning |
| --- | --- |
| `entity_id` | stable local identifier |
| `identity_type` | `organization`, `operator`, `node`, `ground_station`, `satellite`, `sensor`, `agent`, `service` |
| `did` | the actor's `did:key`, or null for actors without keys yet |
| `public_key_multibase` | the multibase part of the did, for consumers that want the raw key |
| `controller_id` | the entity responsible for this one (an operator for a node, an organization for an operator) |
| `status` | lifecycle: `active`, `suspended`, `revoked`, `superseded` |

### 6.2 Authorization (record_type `authorization`)

Shaped like a license so a regulator-issued credential maps onto it without loss.

| Field | Meaning |
| --- | --- |
| `subject_id` | who is authorized |
| `controller_id` | who asserts it (the issuer) |
| `capability` | `receive`, `transmit`, `command`, `schedule`, `publish_data`, `relay` |
| `profile` | `self_declared`, `operator_attested`, `regulator_issued` |
| `jurisdiction` | ISO 3166-1 alpha-2 |
| `bands` | list of `{lower_hz, upper_hz, service}`; required for `transmit` |
| `max_eirp_dbw` | power ceiling |
| `location` | `{latitude, longitude, altitude_m, radius_km}` |
| `valid_from`, `valid_until`, `revoked` | validity |
| `license_reference`, `proof` | the external license and, later, a verifiable credential |

Receive-only operation needs no license in most jurisdictions and is the default self-declared authorization for a new node. A node must not claim `transmit` without bands, and implementations must refuse to schedule a transmit action that has no current `transmit` authorization for the band in question.

### 6.3 Verification objects

Envelopes (section 4) and receipts (section 5). A registry that accepts records issues receipts; a node that produces data issues envelopes.

## 7. Payload profiles

A `payload_type` names a profile. Version 0.1 defines:

| Profile id | Payload | Wrapped as |
| --- | --- | --- |
| `ccsds.omm.json/1` | CCSDS Orbit Mean-Elements Message, JSON key-value form (CelesTrak, Space-Track) | `navigation` record |
| `satnogs.observation.json/1` | SatNOGS Network observation object | `measurement` record |
| `stac.item.json/1` | STAC Item (GeoJSON Feature) | `entity` record of type `data_product` |
| `pass-prediction.json/1` | one predicted contact window from SGP4 propagation | `time` record with `window_kind: predicted_pass` |
| `state-record.json/1` | a canonical state record itself | the record |
| `opaque.json/1` | anything else | `measurement` record with the payload as value |

Profile schemas live in `/schemas/profiles`. They check only what the registry needs to index; full validation belongs to the upstream standard.

## 8. Conformance

An implementation conforms when it passes the vectors published with the reference primitives (`@iricity/frontier-shared/conformance`). The vectors pin canonical JSON (including the RFC 8785 sample), SHA-256, base58btc, did:key framing, Ed25519 (RFC 8032 tests 1 and 2), and byte-exact envelope and receipt signatures from fixed seeds.

## 9. Deferred modules

Not part of 0.1, in the order they are expected to arrive:

- **Discovery** (what a node offers) and **scheduling** (booking a pass) are provided by adapters to existing networks, SatNOGS first. See ADR 0006.
- **Data exchange** beyond signed envelopes: DTN Bundle Protocol (RFC 9171) as transport.
- **Compliance engine**: policy-as-code evaluation of authorizations before an action runs.
- **Accounting**: signed, append-only, non-transferable usage records.
- **Federation**: registries exchanging receipts and identities.

## 10. Versioning

Wire formats carry their own version tags (`state-envelope/1`, `state-receipt/1`, profile ids ending `/1`). A breaking change increments the tag; verifiers keep accepting earlier tags. The protocol's working name is not part of any signed byte, so renaming is free until 0.1 is frozen and remains free afterwards.
