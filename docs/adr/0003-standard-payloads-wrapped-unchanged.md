# ADR 0003: Standard payloads are wrapped unchanged, not restated

Date: 2026-10-16
Status: accepted

## Context

The first version of the canonical record vocabulary restated orbital, observation and product data in its own fields (latitude, longitude, altitude, velocity, and so on). The standards mapping said "conceptual alignment, not binary compatibility in v1". That kind of v1 decision becomes permanent, and it violates the "build on, don't fork" principle at the data level.

## Decision

External standard payloads travel unchanged inside protocol objects, identified by a payload profile:

| Profile | Standard |
| --- | --- |
| `ccsds.omm.json/1` | CCSDS Orbit Mean-Elements Message, JSON key-value form |
| `satnogs.observation.json/1` | SatNOGS Network observation |
| `stac.item.json/1` | STAC Item |
| `pass-prediction.json/1` | SGP4 pass prediction (defined here, because no external standard exists for it) |

A record carries the payload, its hash, the profile id, and only the few indexable fields a registry needs (NORAD id, epoch, timestamps). The restated fields from 0.1.x remain valid for data that has no upstream standard.

## Consequences

- Any tool that already understands OMM, SatNOGS or STAC understands the payload inside a protocol object with no translation.
- Profile schemas check structure only; full validation is delegated to the upstream standard's own schema.
- Adding a new standard is a new profile, not a change to the record vocabulary.
- Hashes are computed over the payload exactly as received, so provenance survives round trips through other systems.
