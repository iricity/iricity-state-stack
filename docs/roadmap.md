# Roadmap

## Done

- Vocabulary and schema model locked; schemas are the single source for the validator.
- Primitive layer with conformance vectors (`@iricity/frontier-shared`): canonical JSON, hashing, `did:key` identity, signed envelopes, signed receipt chains.
- Protocol 0.1 draft: identity, authorization, verification; payload profiles for OMM, SatNOGS observations, STAC items, pass predictions.
- Reference registry: signed, chained receipts; envelope ingest; bridge-artifact verification; verification endpoints open to anyone.
- Applied stack integration: the space stack produces pass predictions, signed observations, node identity and authorization records against this spec.
- Second implementation: a Python implementation of the primitives (`iricity-frontier-shared`, module `frontier_shared`) passes the same vectors (version 2, 60 of 60) and verifies objects produced by the JavaScript implementation, and the reverse.
- Review pass: conformance vectors version 2 with 26 rejection cases; verifiers never throw; receipt ids, hashes and status are checked; registries recompute bridge summaries and bind the normalized record to the conversion record.

## Next

1. **Freeze 0.1.** Resolve the working name (ADR 0004), tag the vectors, publish the primitive packages (npm, PyPI) when the publication decision is made.
2. **Persistence.** A file- or SQLite-backed registry with the same interface as the in-memory one.
3. **Regulator-issued authorizations.** Verifiable Credential proof on the authorization record; a sample mapping from one national amateur license.
4. **Federation sketch.** Two registries exchanging receipts and identities; conflict rules.
5. **Domain modules.** polar, ocean, geo, lunar: each is a set of payload profiles and adapters, not new primitives.

## Not planned

- A scheduling layer of our own (ADR 0006).
- Tokens or transferable credits of any kind.
- A second canonical form or hash function in 0.x.
