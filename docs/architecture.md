# Architecture

## Purpose

`iricity-state-stack` is the canonical protocol layer for machine-native records across the workspace.

It defines how objects, agents, sensors, messages, commands, resources, constraints, conversions, and receipts are represented consistently.

## Layer Position

- below public products
- below applied domain stacks
- above raw data and legacy systems

## Core Responsibilities

- define canonical schemas
- validate records
- preserve provenance
- create deterministic receipts
- support conversion from legacy formats
- expose queryable timelines
- ingest and summarize bridge artifacts from applied stacks when normalized records, conversion records, and receipts should be reviewed together

## Design Rules

- one canonical meaning per field
- no public-product semantics in the foundation layer
- no hidden runtime assumptions in schema definitions
- every accepted record should be replayable

## Minimum First Pass

1. canonical JSON utility
2. SHA-256 hash utility
3. schema validator
4. in-memory registry
5. receipt engine
6. conversion record model
7. timeline query model
