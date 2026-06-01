# Conversion Model

## Purpose

Conversion is a first-class subsystem.

The stack must accept old-world records and normalize them into canonical Iricity records without losing origin evidence.

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

