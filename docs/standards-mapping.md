# Standards Mapping

## Purpose

This repo does not implement full protocol interoperability first.

It defines field-level and conceptual alignment so future adapters can map into external standards cleanly.

## Primary References

### CCSDS

Use for:
- navigation data messages
- orbit and attitude record shapes
- mission data system alignment

### SANA

Use for:
- registry thinking
- assigned-number style governance
- identifier and reference-frame structure

### DTN / Bundle Protocol

Use for:
- communication record structure
- intermittent-network delivery concepts
- security and payload block thinking

### LunaNet

Use for:
- integrated communications and PNT alignment
- future space-domain service models

### NIST PQC

Use later for:
- quantum-safe identity and proof profiles
- post-quantum signature and key exchange metadata

## Mapping Principle

The goal is not binary compatibility in v1.

The goal is:
- field compatibility
- conceptual alignment
- adapter-friendly evolution

