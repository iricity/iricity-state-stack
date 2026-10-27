# Standards Mapping

## Principle

Build on, do not fork. Where an established standard defines a payload, the protocol carries that payload unchanged under a payload profile and adds identity, time and hashes around it (ADR 0003). Where no standard exists, the protocol defines the smallest object that does the job and says so.

## Adopted as-is

| Standard | Used for | How |
| --- | --- | --- |
| RFC 8785 JSON Canonicalization Scheme | every hash and signature | `canonicalJson` in the primitive layer; vectors include the RFC sample |
| RFC 8032 Ed25519 | signatures | Node `crypto`; vectors include RFC tests 1 and 2 |
| W3C DID Core, did:key method | identity | `did:key:z6Mk…` with multicodec ed25519-pub |
| CCSDS 502.0-B Orbit Data Messages (OMM) | orbital elements | profile `ccsds.omm.json/1`, JSON key-value form as served by CelesTrak and Space-Track |
| SatNOGS Network API observation | RF observations | profile `satnogs.observation.json/1` |
| STAC 1.x Item | data products | profile `stac.item.json/1` |
| ISO 3166-1 alpha-2 | jurisdiction in authorizations | pattern-checked |
| W3C Verifiable Credentials Data Model 2.0 | regulator-issued authorizations | the `proof` field carries a credential over the attested fields; `controller_id` is the issuer's `did:key` |
| W3C Data Integrity, cryptosuite `eddsa-jcs-2022` | securing those credentials | JCS is the protocol's canonical form, so no JSON-LD processing is needed |

## Aligned conceptually, adopted later

| Standard | Planned use |
| --- | --- |
| IETF RFC 9171 DTN Bundle Protocol | transport for data exchange between nodes with intermittent links |
| CCSDS SLE and service management | commercial ground-station adapters |
| XTCE | telemetry definitions when a mission-control adapter is added |
| SANA registries | identifier governance if the protocol reaches standards bodies |
| NIST post-quantum signatures | a second signature algorithm in a future envelope version |

## Defined here

| Object | Why no external standard fits |
| --- | --- |
| `state-envelope/1` | a detached-capable, chainable signature header over an arbitrary standard payload |
| `state-receipt/1` | an append-only acceptance log with identity-bound signatures |
| `pass-prediction.json/1` | no interoperable JSON form exists for a predicted contact window |
| authorization record | a license-shaped, machine-readable statement of permitted capability that regulator credentials can map onto |
