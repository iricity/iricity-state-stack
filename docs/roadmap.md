# Roadmap

## Done

- Vocabulary and schema model locked; schemas are the single source for the validator.
- Primitive layer with conformance vectors (`@iricity/frontier-shared`): canonical JSON, hashing, `did:key` identity, signed envelopes, signed receipt chains.
- Protocol 0.1 draft: identity, authorization, verification; payload profiles for OMM, SatNOGS observations, STAC items, pass predictions.
- Reference registry: signed, chained receipts; envelope ingest; bridge-artifact verification; verification endpoints open to anyone.
- Applied stack integration: the space stack produces pass predictions, signed observations, node identity and authorization records against this spec.

## Next

1. **Freeze 0.1.** Resolve the working name (ADR 0004), tag the vectors, publish the primitive package.
2. **Second implementation.** A Python implementation of the primitives that passes the vectors, to prove the spec is language-neutral.
3. **Persistence.** A file- or SQLite-backed registry with the same interface as the in-memory one.
4. **Regulator-issued authorizations.** Verifiable Credential proof on the authorization record; a sample mapping from one national amateur license.
5. **Federation sketch.** Two registries exchanging receipts and identities; conflict rules.
6. **Domain modules.** polar, ocean, geo, lunar: each is a set of payload profiles and adapters, not new primitives.

## Not planned

- A scheduling layer of our own (ADR 0006).
- Tokens or transferable credits of any kind.
- A second canonical form or hash function in 0.x.
