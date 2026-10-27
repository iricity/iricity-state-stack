# ADR 0008: Registries anchor each other; there is no consensus

Date: 2026-10-27
Status: accepted (draft module; not part of the 0.1 core)

## Context

The specification lists federation ("registries exchanging receipts and identities") as a deferred module. The temptation is a shared ledger or a voting scheme. Neither fits: each registry is operated by one party, keeps one append-only chain, and already proves its own integrity. What two registries lack is a way to notice when one of them rewrites history.

## Decision

Registries anchor each other.

- A registry publishes its chain head at `GET /chain/head`: a `state-envelope/1` envelope with `payload_type: chain-head.json/1`, naming its DID, the receipt hash at the head of its chain, the chain length and a timestamp, signed by the registry.
- To anchor a peer, a registry fetches the head, verifies the envelope against the DID it names, fetches the peer's receipts, verifies the whole chain against that DID, and checks that the chain really ends at the published head. It then records a `measurement` of type `chain_anchor` (peer DID, head, length, when) and receipts it into its own chain.
- Conflict rule: the next anchor of the same peer must find the previously anchored head at the previously anchored position. If it does not, the peer has rewritten history. The anchoring registry records a `chain_conflict` measurement (anchored head and length, observed head and length), receipts it, and refuses to anchor again until an operator intervenes.
- A registry does not anchor itself.

## What this is not

- Not consensus. Nothing is voted on; no registry's chain is changed by another.
- Not replication. A registry does not copy the peer's records; it records that it verified them up to a point.
- Not trust. An anchor says "at this time, this peer's chain verified and ended here"; it says nothing about the truth of the records inside.

## Consequences

- Two independent registries that anchor each other periodically give every observer a cheap test for rewritten history: compare anchors.
- Conflicts are evidence, receipted and signed, not alarms that vanish.
- Anchors are ordinary records, so a durable registry keeps them across restarts and a file-backed log replays them.
- The two-registry example in this repository and the two-node demonstration in the node repository exercise the whole path: descriptors, envelopes, receipts, anchors, and a detected rewrite.
