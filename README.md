# Iricity State Stack

Canonical foundation for machine-readable identity, authorization, provenance, conversion, receipts, and timelines.

## Role

This repo defines the shared semantics for frontier-domain systems in the Iricity workspace.

It is not the public SaaS layer and it is not a duplicate of the space stack.

## Canonical Record Types

- entity
- authorization
- time
- navigation
- measurement
- communication
- command
- resource
- constraint
- conversion
- transition
- receipt

## Core Principles

- canonical JSON first
- schema-first development
- SHA-256 hashing for deterministic record identity
- append-only receipts
- conversion never discards source data
- adapters translate old formats into normalized state records

## Suggested Structure

- `docs/`
- `schemas/`
- `registry/`
- `engine/`
- `adapters/`
- `intake/`
- `routes/`
- `utils/`
- `tests/`

## Immediate Objective

Lock the vocabulary and schema model before any implementation-heavy work.
Bridge artifacts from applied stacks should now be ingestible through the state stack demo server so normalized records, conversion records, and receipts can be inspected together, with summary and filtered lookup support for deeper review.
The demo landing page at `/` or `/demo` should show the live bridge summary, the filter controls, the filtered bridge list, and the main inspection links so the foundation is easy to explore locally.

## Workspace References

- [Workspace deployment posture](/c:/Users/Yoga/Desktop/workspace/vscode_workspace_iricity/DEPLOYMENT_POSTURE.md)
- [Workspace legal posture](/c:/Users/Yoga/Desktop/workspace/vscode_workspace_iricity/LEGAL_POSTURE.md)
- [Workspace CI](/c:/Users/Yoga/Desktop/workspace/vscode_workspace_iricity/WORKSPACE_CI.md)
