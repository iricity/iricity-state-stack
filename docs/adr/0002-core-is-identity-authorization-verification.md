# ADR 0002: The protocol core is identity, authorization and verification

Date: 2026-10-16
Status: accepted

## Context

The planning framework lists nine protocol modules: identity, authorization registry, discovery, scheduling, data exchange, verification, compliance engine, accounting, federation. Discovery and scheduling already exist in the ecosystem (SatNOGS for the amateur community, commercial providers through their APIs). What does not exist anywhere is portable, verifiable provenance for observations and schedules, and machine-readable authorization. Those are also what the existing repositories are already strong at.

## Decision

Version 0.1 of the protocol has three core modules: identity, authorization, verification. Everything else is either an adapter to an existing system (discovery, scheduling) or a later module built on the core (data exchange transport, compliance engine, accounting, federation).

## Consequences

- The specification is small enough to implement in a weekend in any language, which is the property that makes a protocol spread.
- The protocol is useful at a single node: one receive-only station can publish signed observations and a self-declared authorization that anyone can verify.
- The project does not compete with SatNOGS or with ground-station-as-a-service providers; it makes their outputs verifiable and legally legible.
- A node that wants to schedule a pass talks to SatNOGS through an adapter and wraps the result in protocol objects. The protocol never owns the schedule.
