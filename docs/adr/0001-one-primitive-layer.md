# ADR 0001: One primitive layer for canonical form, hashing, identity and receipts

Date: 2026-10-16
Status: accepted

## Context

Two foundations were growing in parallel. The space work needed receipts, attestation, identity and authorization. The machine-economy work in the private planning notes defines the same four concepts under its own names and repos. Two primitive layers for the same primitives drift, and reconciling them later costs years.

## Decision

There is exactly one primitive layer: `@iricity/frontier-shared`. It owns canonical JSON, hashing, ed25519 identity as `did:key`, the signed envelope, and the signed receipt chain, with published conformance vectors.

The space protocol is a domain profile on top of that layer. Any future machine-economy protocol is another domain profile on top of the same layer. Neither redefines a primitive.

## Consequences

- The state stack and the space stack import primitives; they do not implement signing, hashing or canonicalization themselves. The space stack's existing per-scope signing keeps working for its own operator surfaces but node identity and node-issued objects use the shared primitives.
- Changing a primitive means changing one package and its vectors, and every dependent repo sees the change in its tests.
- The primitive package must stay free of product knowledge: no pricing, no catalog, no product names in its API.
