# Conversion Model

## Purpose

Conversion is a first-class subsystem.

The registry must accept records from existing systems and normalize them into canonical records without losing origin evidence.

## Conversion Flow

raw input
-> adapter
-> normalized record
-> validation
-> hash
-> conversion record
-> receipt
-> timeline

## Required Preservation

Every conversion must preserve:

- raw input hash
- source system
- source format
- adapter name
- adapter version
- conversion rule
- normalized output hash
- ingestion timestamp
- receipt reference

## Example Mappings

- CSV row -> measurement record
- JSON API event -> state transition or measurement record
- GPS/NMEA sentence -> navigation record
- GeoJSON feature -> navigation or spatial record
- TLE -> orbit/navigation record
- communication log -> communication record
- database row -> state transition
- sensor file -> measurement record plus provenance

## Conversion Rules

- never discard the original
- keep the adapter explicit
- keep normalization deterministic
- make the output replayable

## Bridge artifacts

An applied stack hands a registry a bridge artifact: `{bridge_type, normalized_record, conversion_record, receipt, summary}`. The registry accepts it only when all of these hold, and otherwise rejects the whole artifact:

- `receipt` is a protocol receipt (`state-receipt/1`) that verifies against `conversion_record`;
- `normalized_record` validates against its schema and its hash equals `conversion_record.normalized_record_hash`;
- `conversion_record` validates against the conversion schema.

The submitted `summary` is never stored. The registry recomputes the summary from the records and the receipt, so every field in it (source system, source event, run, hashes, receipt issuer, status) is derivable by anyone holding the artifact. A receipt signed by the applied stack's node identity makes the bridge `identity_bound` with status `issued`; an unsigned receipt is accepted and labelled `unsigned`. The registry then issues its own receipts for the normalized record and the conversion record, so both enter its chain.

