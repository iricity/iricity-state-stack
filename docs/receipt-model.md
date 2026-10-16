# Receipt Model

A receipt proves that an issuer accepted a specific record (by canonical hash) at a specific time, linked to the issuer's previous receipt. The wire format is `state-receipt/1`, defined in `docs/spec/protocol-v0.1.md` section 5 and produced by the primitive layer.

## Fields

| Field | Role |
| --- | --- |
| `receipt_version` | `state-receipt/1`; required (absent only on pre-0.1 legacy receipts) |
| `receipt_id` | `rcp_` + 24 hex of SHA-256 over `{record_hash, previous_hash, timestamp, issuer}`; a receipt with any other id is invalid |
| `record_hash` | canonical hash of the accepted record |
| `previous_hash` | the preceding receipt's `receipt_hash`, or null at genesis |
| `timestamp` | acceptance time, ISO-8601 UTC with a `Z` suffix (spec section 3) |
| `issuer` | the registry's `did:key` (signed) or a plain name (unsigned) |
| `receipt_hash` | canonical hash of the five core fields above; required |
| `signature`, `signature_algorithm`, `key_id` | `ed25519` over `state-receipt/1:` + canonical core; or `sha256_chain_legacy`; or `none` |
| `verification_status` | `issued` for `ed25519` receipts, `unsigned` for `none`; a mismatch is invalid |

## Rules

- Append-only. A registry never rewrites or reorders receipts.
- One chain per registry. Every accepted record extends the chain.
- Verification is offline: the issuer's public key is in the issuer identifier.
- Honest strength. An unsigned receipt is labelled `none`/`unsigned`; a hash is never presented as a signature.
- The receipt commits to the record exactly as submitted. A registry may store the record with derived fields attached (`record_hash`, `subject_id`), but `record_hash` is always the hash of what the submitter sent, so they can verify the receipt against their own copy.
- Verification never throws. Malformed input yields a result with errors.

## Chains across the bridge

Three chains meet at a bridge artifact, and they stay distinct:

- The applied stack's own receipt (its internal provenance) is linked, not re-signed: the bridge receipt may carry its hash as `previous_hash` and its id as `linked_receipt_id`.
- The bridge receipt is a protocol receipt over the conversion record, issued by the applied stack (signed by its node identity when it has one).
- The registry's chain receives its own receipts for the normalized record and the conversion record when the artifact is accepted.

A registry verifies the bridge receipt against the conversion record before accepting anything, and never issues a receipt over a receipt it cannot verify.

## Verifying

- One receipt: recompute `receipt_hash`, check the signature against the issuer, optionally compare `record_hash` against the record and `previous_hash` against the previous receipt.
- A chain: verify oldest first; each `previous_hash` must equal the previous `receipt_hash`; optionally require genesis.

Reference implementation: `createReceiptRecord`, `verifyReceiptRecord`, `verifyReceiptChain` in `@iricity/frontier-shared`; `InMemoryStateRegistry.verifyChain()` here.
