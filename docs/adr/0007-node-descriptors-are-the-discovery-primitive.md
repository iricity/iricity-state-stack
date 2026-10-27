# ADR 0007: Node descriptors are the discovery primitive

Date: 2026-10-27
Status: accepted (draft module; not part of the 0.1 core)

## Context

ADR 0006 keeps discovery out of the core and defers it to adapters over existing networks. Two nodes and a registry now exist, and the first question between them is the simplest one: how does a registry learn that a node exists and what it offers, without a central directory and without trusting anyone's word for it?

## Decision

A node publishes one signed document at a well-known path:

- `GET /.well-known/frontier-node.json` returns a `state-envelope/1` envelope with `payload_type: node-descriptor.json/1`, signed by the node.
- The payload names the node (`node_id`, `did`, `operator`, `jurisdiction`, `site`), its public URL and endpoints, the protocol versions and payload profiles it produces, and its authorization records.
- The envelope's signer must equal the `did` inside the payload. A descriptor that does not bind to its signer is not a descriptor.

A registry discovers a node by fetching that document, verifying it, and ingesting it as the node's identity record (an `entity` with `identity_type: node`), which receipts the discovery into the registry's chain. `GET /demo/nodes` lists what has been discovered. Nothing else is standardized: no central directory, no registration, no crawling order. Aggregation across registries is left to the federation work (ADR 0008).

## Consequences

- Discovery costs one HTTP request and one signature check. A node is "found" by URL and "trusted" by DID, which is already how the rest of the protocol works.
- Anyone can run a directory: a registry's node list is just its receipted descriptors, verifiable by anyone.
- A node can change its endpoints or authorizations by publishing a new descriptor; the registry's chain keeps every version it saw.
- The operated stack and the reference node both serve the document, built by the same pure function, so the two cannot drift.
