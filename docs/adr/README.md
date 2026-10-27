# Architecture Decision Records

Each record captures one decision that shapes the protocol or its reference implementations, the context that forced it, and its consequences. Records are append-only; a reversed decision gets a new record that supersedes the old one.

| ADR | Decision |
| --- | --- |
| [0001](0001-one-primitive-layer.md) | One primitive layer for canonical form, hashing, identity and receipts |
| [0002](0002-core-is-identity-authorization-verification.md) | The protocol core is identity, authorization and verification |
| [0003](0003-standard-payloads-wrapped-unchanged.md) | Standard payloads are wrapped unchanged, not restated |
| [0004](0004-naming-and-licensing.md) | Naming and licensing |
| [0005](0005-governance-deferred.md) | Governance machinery is deferred until there is a community to govern |
| [0006](0006-scheduling-and-discovery-are-adapters.md) | Scheduling and discovery are adapters to existing networks |
| [0007](0007-node-descriptors-are-the-discovery-primitive.md) | Node descriptors are the discovery primitive (draft module) |
| [0008](0008-anchoring-not-consensus.md) | Registries anchor each other; there is no consensus (draft module) |

Template for new records: title, date, status, context, decision, consequences.