# Registry Model

## Canonical Records

### Entity

What exists.

Typical fields:
- entity_id
- entity_type
- controller_id
- public_key
- status
- created_at
- metadata_hash

### Authorization

What an entity or subject is allowed to do.

Typical fields:
- subject_id
- controller_id
- capability
- scope
- valid_from
- valid_until
- revoked
- proof

### Time

When and under which clock source.

Typical fields:
- timestamp
- time_scale
- clock_source
- clock_uncertainty
- sync_method
- drift_bound

### Navigation

Where and how something moves.

Typical fields:
- entity_id
- reference_frame
- latitude
- longitude
- altitude
- velocity
- heading
- attitude
- uncertainty
- sensor_source
- timestamp

### Measurement

What was observed.

Typical fields:
- sensor_id
- measurement_type
- value
- unit
- uncertainty
- calibration_id
- timestamp
- source

### Communication

Who sent what to whom.

Typical fields:
- message_id
- source_node
- destination_node
- payload_hash
- route
- timestamp
- delivery_status
- security_profile

### Command

Who instructed what.

Typical fields:
- command_id
- issuer
- target
- command_type
- authorization
- pre_state_hash
- post_state_hash
- execution_status

### Resource

What was consumed or allocated.

Typical fields:
- resource_type
- quantity
- unit
- owner
- allocation
- usage
- quota
- cost
- settlement_status

### Constraint

What is allowed or forbidden.

Typical fields:
- constraint_id
- constraint_type
- scope
- limit
- threshold
- allowed_action
- forbidden_action
- override_policy

### Conversion

How old data became new data.

Typical fields:
- source_system
- source_format
- raw_record_hash
- adapter_name
- adapter_version
- normalized_record_hash
- conversion_rule
- ingested_at
- receipt_id

### Transition

How one state became another.

Typical fields:
- transition_id
- subject_id
- from_state
- to_state
- reason
- timestamp
- receipt_id

### Receipt

What proves the record.

Typical fields:
- receipt_id
- record_type
- record_hash
- previous_hash
- timestamp
- issuer
- signature
- verification_status

