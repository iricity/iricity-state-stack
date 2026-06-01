# Receipt Model

## Purpose

Receipts prove that a record was accepted, hashed, and persisted in a deterministic form.

## Receipt Responsibilities

- identify the record type
- carry the record hash
- reference the previous hash when relevant
- include timestamp and issuer
- support verification

## Verification Goals

- confirm hash integrity
- confirm expected issuer or signer
- confirm sequence continuity where needed
- confirm receipt status

## Receipt Principles

- append-only by default
- deterministic over canonical JSON
- no ambiguous provenance
- stable enough for audit and replay

## Minimum Receipt Fields

- receipt_id
- record_type
- record_hash
- previous_hash
- timestamp
- issuer
- signature
- verification_status

