# Receipt Model

A receipt proves that an issuer accepted a specific record (by canonical hash) at a specific time, linked to the issuer's previous receipt. The wire format is `state-receipt/1`, defined in `docs/spec/protocol-v0.1.md` section 5 and produced by the primitive layer.

## Fields

| Field | Role |
| --- | --- |
| `receipt_id` | `rcp_` + 24 hex of SHA-256 over `{record_hash, previous_hash, timestamp, issuer}` |
| `record_hash` | canonical hash of the accepted record |
| `previous_hash` | the preceding receipt's `receipt_hash`, or null at genesis |
| `timestamp` | acceptance time, UTC |
| `issuer` | the registry's `did:key` (signed) or a plain name (unsigned) |
| `receipt_hash` | canonical hash of the five core fields above |
| `signature`, `signature_algorithm`, `key_id` | `ed25519` over `state-receipt/1:` + canonical core; or `sha256_chain_legacy`; or `none` |
| `verification_status` | `issued` for signed receipts, `unsigned` otherwise |

## Rules

- Append-only. A registry never rewrites or reorders receipts.
- One chain per registry. Every accepted record extends the chain.
- Verification is offline: the issuer's public key is in the issuer identifier.
- Honest strength. An unsigned receipt is labelled `none`/`unsigned`; a hash is never presented as a signature.

## Verifying

- One receipt: recompute `receipt_hash`, check the signature against the issuer, optionally compare `record_hash` against the record and `previous_hash` against the previous receipt.
- A chain: verify oldest first; each `previous_hash` must equal the previous `receipt_hash`; optionally require genesis.

Reference implementation: `createReceiptRecord`, `verifyReceiptRecord`, `verifyReceiptChain` in `@iricity/frontier-shared`; `InMemoryStateRegistry.verifyChain()` here.
