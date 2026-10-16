# ADR 0006: Scheduling and discovery are adapters to existing networks

Date: 2026-10-16
Status: accepted

## Context

A scheduling layer is the most visible part of a ground-network coordination protocol, and the most tempting to build. It is also where the project would compete with the community it depends on. SatNOGS already discovers stations, schedules observations and publishes results through a public API. Commercial providers do the same for paying operators.

## Decision

The protocol does not own discovery or scheduling. The reference node:

- ingests SatNOGS observations through a connector and wraps them in signed envelopes and canonical records;
- computes its own pass predictions from CCSDS OMM elements with SGP4 and publishes them as signed `pass-prediction.json/1` objects;
- declares what it is and what it may do through identity and authorization records.

A later discovery module, if one is needed, aggregates such declarations; a later scheduling module books through adapters and records the booking as protocol objects. Neither replaces the upstream network.

## Consequences

- The first thing a hobbyist gets from the protocol is something SatNOGS does not give them: signed, verifiable provenance for their observations and a machine-readable statement of what their station is allowed to do.
- The SatNOGS community is a collaborator, not a competitor, which the planning framework identifies as a condition for adoption.
- The orbit service in the reference node is real (CelesTrak elements, SGP4 propagation) rather than a placeholder, because pass prediction is the one piece of scheduling every node must do locally.
