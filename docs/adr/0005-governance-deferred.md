# ADR 0005: Governance machinery is deferred until there is a community to govern

Date: 2026-10-16
Status: accepted

## Context

The planning framework describes a foundation, a technical steering committee, a proposal process, seat caps and a conflict-of-interest policy. Those are correct for a project with outside contributors. At one contributor they are paperwork that signals maturity the project does not have, and they can make the project look bigger and slower than it is.

## Decision

Now:

- permissive licenses on every public commit (ADR 0004)
- Architecture Decision Records in this directory for every decision that shapes the protocol
- a machine-readable protocol description (`GET /spec`) and published conformance vectors, so compatibility is earned by passing tests rather than by asking permission
- signed releases once a public repository exists

Deferred until there are at least three regular outside contributors:

- a formal proposal process
- a steering body and seat caps
- a foundation or fiscal sponsor
- a conflict-of-interest policy beyond this record

## Consequences

- Early contributors see a small, honest project with written reasoning, not an empty constitution.
- When governance arrives, the ADR history is the record it inherits.
