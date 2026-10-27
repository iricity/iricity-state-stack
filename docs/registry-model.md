# Registry Model

The canonical record types, generated from the JSON Schemas in `schemas/` (the normative source). A field marked **required** must be present; `record_type` is always required and fixed. Unless a schema says otherwise, additional fields are allowed and carried unchanged. Every time field uses the time form of the specification (ISO-8601 UTC, `Z` suffix).

Rules the schemas cannot express, enforced by the reference registry on ingest: a `transmit` authorization declares at least one band; each band has numeric `lower_hz < upper_hz`; `valid_until` is not earlier than `valid_from`; identity records (`entity` with `identity_type`) use status `active`, `suspended`, `revoked` or `superseded`; a `receipt` record must verify.

## Entity (`entity`)

What exists. When identity_type and did are present this is an identity record: a machine actor with an ed25519 did:key.

| Field | Type | Notes |
| --- | --- | --- |
| `entity_id` | string | **required** |
| `entity_type` | string | **required** |
| `identity_type` | one of `organization`, `operator`, `node`, `ground_station`, `satellite`, `sensor`, `agent`, `service` |  |
| `did` | `did:key` (ed25519) |  |
| `public_key_multibase` | multibase ed25519 public key |  |
| `public_key` | string |  |
| `controller_id` | string |  |
| `display_name` | string or null |  |
| `status` | string | Identity records (identity_type present) use active, suspended, revoked or superseded; other entities may use domain statuses. Enforced by registries. |
| `created_at` | timestamp | **required** |
| `metadata_hash` | string |  |
| `payload_profile` | string |  |
| `payload_hash` | hash reference |  |
| `payload` | object | A wrapped standard payload (for example a STAC item), unchanged. |

## Authorization (`authorization`)

What a subject may do, stated machine-readably. Shaped like a spectrum or operating license so regulator-issued credentials can be mapped onto it without loss. profile says who stands behind the claim. Rules the schema cannot express and registries enforce: a transmit authorization declares at least one band, and lower_hz < upper_hz in every band.

| Field | Type | Notes |
| --- | --- | --- |
| `authorization_id` | `auth_` + 24 hex | auth_ + first 24 hex of sha256 over the canonical record without authorization_id. |
| `subject_id` | string | **required** |
| `controller_id` | string | **required**. The issuer: the party asserting this authorization. |
| `capability` | one of `receive`, `transmit`, `command`, `schedule`, `publish_data`, `relay` | **required** |
| `scope` | string or null |  |
| `profile` | one of `self_declared`, `operator_attested`, `regulator_issued` |  |
| `jurisdiction` | ISO 3166-1 alpha-2 | ISO 3166-1 alpha-2. |
| `bands` | array of `{lower_hz, upper_hz, service, emission_designator}` |  |
| `max_eirp_dbw` | number or null |  |
| `location` | object or null with `latitude`, `longitude`, `altitude_m`, `radius_km` |  |
| `valid_from` | timestamp |  |
| `valid_until` | timestamp |  |
| `revoked` | boolean |  |
| `license_reference` | string or null |  |
| `proof` | string or object or null | A document hash, a verifiable credential, or null for self-declared authorizations. For `regulator_issued` records: a W3C Verifiable Credential with an `eddsa-jcs-2022` Data Integrity proof, verified and bound to the record on ingest (spec section 6.2). |

## Time (`time`)

When, under which clock. Also used for predicted contact windows (window_kind predicted_pass).

| Field | Type | Notes |
| --- | --- | --- |
| `timestamp` | timestamp | **required** |
| `time_scale` | string |  |
| `clock_source` | string |  |
| `clock_uncertainty` | string |  |
| `sync_method` | string |  |
| `drift_bound` | string |  |
| `window_kind` | string |  |
| `window_start` | string |  |
| `window_end` | string |  |
| `time_of_closest_approach` | string |  |
| `max_elevation_deg` | number (0..90) |  |
| `duration_seconds` | number (0..) |  |
| `entity_id` | string |  |
| `observer_id` | string or null |  |
| `payload_profile` | string |  |
| `payload` | object |  |
| `payload_hash` | hash reference |  |

## Navigation (`navigation`)

Where and how something moves. For orbital elements the record wraps a CCSDS OMM unchanged (payload_profile ccsds.omm.json/1) rather than restating it.

| Field | Type | Notes |
| --- | --- | --- |
| `entity_id` | string | **required** |
| `reference_frame` | string |  |
| `latitude` | number or null |  |
| `longitude` | number or null |  |
| `altitude` | number or null |  |
| `velocity` | number or null |  |
| `heading` | number or null |  |
| `attitude` | any |  |
| `uncertainty` | any |  |
| `sensor_source` | string |  |
| `timestamp` | timestamp | **required** |
| `payload_profile` | string |  |
| `payload` | object |  |
| `payload_hash` | hash reference |  |
| `norad_cat_id` | integer |  |
| `object_name` | string or null |  |
| `object_id` | string or null |  |
| `epoch` | string |  |

## Measurement (`measurement`)

What was observed. External observation formats (for example a SatNOGS observation) are carried unchanged in value with their payload_profile and payload_hash.

| Field | Type | Notes |
| --- | --- | --- |
| `sensor_id` | string | **required** |
| `measurement_type` | string | **required** |
| `value` | any |  |
| `unit` | string |  |
| `uncertainty` | any |  |
| `calibration_id` | string or null |  |
| `timestamp` | timestamp | **required** |
| `source` | string |  |
| `payload_profile` | string |  |
| `payload_hash` | hash reference |  |
| `envelope_hash` | hash reference |  |
| `signer` | string |  |
| `observation_id` | any |  |
| `norad_cat_id` | integer or null |  |
| `ground_station` | any |  |
| `window_start` | string or null |  |
| `window_end` | string or null |  |

## Communication (`communication`)

| Field | Type | Notes |
| --- | --- | --- |
| `message_id` | string | **required** |
| `source_node` | string | **required** |
| `destination_node` | string | **required** |
| `payload_hash` | hash reference |  |
| `route` | string |  |
| `timestamp` | timestamp | **required** |
| `delivery_status` | string |  |
| `security_profile` | string |  |

## Command (`command`)

| Field | Type | Notes |
| --- | --- | --- |
| `command_id` | string | **required** |
| `issuer` | string | **required** |
| `target` | string | **required** |
| `command_type` | string |  |
| `authorization` | string or null | authorization_id of the authorization record that permitted this command |
| `pre_state_hash` | string |  |
| `post_state_hash` | string |  |
| `execution_status` | string |  |

## Resource (`resource`)

| Field | Type | Notes |
| --- | --- | --- |
| `resource_type` | string | **required** |
| `quantity` | number | **required** |
| `unit` | string | **required** |
| `owner` | string |  |
| `allocation` | string |  |
| `usage` | string |  |
| `quota` | string |  |
| `cost` | number |  |
| `settlement_status` | string |  |

## Constraint (`constraint`)

| Field | Type | Notes |
| --- | --- | --- |
| `constraint_id` | string | **required** |
| `constraint_type` | string | **required** |
| `scope` | string |  |
| `limit` | any |  |
| `threshold` | any |  |
| `allowed_action` | string |  |
| `forbidden_action` | string |  |
| `override_policy` | string |  |

## Conversion (`conversion`)

How external data became a canonical record. The source is never discarded: its hash travels with the normalized record.

| Field | Type | Notes |
| --- | --- | --- |
| `source_system` | string | **required** |
| `source_format` | string | **required** |
| `raw_record_hash` | hash reference | **required** |
| `adapter_name` | string |  |
| `adapter_version` | string |  |
| `normalized_record_hash` | hash reference | **required** |
| `conversion_rule` | string |  |
| `ingested_at` | timestamp |  |
| `receipt_id` | string or null |  |
| `source_event_id` | string or null |  |
| `source_analysis_id` | string or null |  |

## Transition (`transition`)

| Field | Type | Notes |
| --- | --- | --- |
| `transition_id` | string | **required** |
| `subject_id` | string | **required** |
| `from_state` | string | **required** |
| `to_state` | string | **required** |
| `reason` | string or null |  |
| `timestamp` | timestamp |  |
| `receipt_id` | string or null |  |

## Receipt (`receipt`)

Proof that a record (by canonical hash) was accepted by an issuer at a time, linked to the previous receipt. Wire format state-receipt/1. receipt_hash is required for state-receipt/1 receipts; the verifier enforces it.

| Field | Type | Notes |
| --- | --- | --- |
| `receipt_version` | one of `state-receipt/1` | Required for ed25519 and unsigned receipts; absent on sha256_chain_legacy receipts. |
| `receipt_id` | `rcp_` + 16 to 24 hex | **required**. rcp_ + first 24 hex of sha256 over canonical {record_hash, previous_hash, timestamp, issuer}; legacy receipts use 16 hex of the record hash. |
| `record_hash` | hash reference | **required** |
| `previous_hash` | hash reference | **required** |
| `receipt_hash` | hash reference |  |
| `timestamp` | timestamp | **required** |
| `issuer` | string | **required**. A did:key for ed25519 receipts; a plain name for unsigned or legacy receipts. |
| `key_id` | string or null |  |
| `signature` | string or null |  |
| `signature_algorithm` | one of `ed25519`, `sha256_chain_legacy`, `none` | **required** |
| `verification_status` | one of `issued`, `unsigned` |  |
| `linked_receipt_id` | string or null |  |

## Envelope (`envelope`)

The signed envelope `state-envelope/1` is not a record type; its schema (`schemas/envelope.schema.json`, no additional fields allowed) is used by `POST /verify/envelope` and on envelope ingest. See the specification, section 4.
