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

