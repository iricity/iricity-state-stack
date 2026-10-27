# Roadmap

## Done

- Vocabulary and schema model locked; schemas are the single source for the validator.
- Primitive layer with conformance vectors (`@iricity/frontier-shared`): canonical JSON, hashing, `did:key` identity, signed envelopes, signed receipt chains.
- Protocol 0.1 draft: identity, authorization, verification; payload profiles for OMM, SatNOGS observations, STAC items, pass predictions.
- Reference registry: signed, chained receipts; envelope ingest; bridge-artifact verification; verification endpoints open to anyone.
- Applied stack integration: the space stack produces pass predictions, signed observations, node identity and authorization records against this spec.
- Second implementation: a Python implementation of the primitives (`iricity-frontier-shared`, module `frontier_shared`) passes the same vectors (version 2, 60 of 60) and verifies objects produced by the JavaScript implementation, and the reverse.
- Review pass: conformance vectors version 2 with 26 rejection cases; verifiers never throw; receipt ids, hashes and status are checked; registries recompute bridge summaries and bind the normalized record to the conversion record.
- Regulator-issued authorizations: the `proof` field carries a W3C Verifiable Credential secured with `eddsa-jcs-2022`; registries verify and bind it on ingest; one national amateur licence mapped as an example.
- Discovery and federation drafts: node descriptors at `/.well-known/frontier-node.json` (ADR 0007) and registry anchoring with a conflict rule (ADR 0008), both runnable: `examples/two-registries.mjs` here and the two-node demonstration in the node repository.
- Credential vectors: conformance version 3 (75 cases) with a `credential` suite, passed in full by both implementations.
- Persistence: `FileStateRegistry`, an append-only JSON-lines log with the same interface as the in-memory registry, replayed and chain-verified on start, bound to one issuer; `STATE_REGISTRY_PATH` runs the server on it.

## Next

1. **Freeze 0.1.** Resolve the working name (ADR 0004), tag the vectors, publish the primitive packages (npm, PyPI) when the publication decision is made.
2. **Federation, next steps.** Periodic anchoring on a schedule; anchoring more than one peer; a directory that aggregates descriptors across registries; what an operator does after a recorded conflict.
3. **Domain modules.** polar, ocean, geo, lunar: each is a set of payload profiles and adapters, not new primitives.

## Not planned

- A scheduling layer of our own (ADR 0006).
- Tokens or transferable credits of any kind.
- A second canonical form or hash function in 0.x.
