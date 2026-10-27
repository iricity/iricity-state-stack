import { ENVELOPE_VERSION, RECEIPT_VERSION, PAYLOAD_PROFILES, CANONICAL_STATE_RECORD_TYPES } from '@iricity/frontier-shared';

/**
 * Machine-readable description of the protocol this stack implements.
 * The name is the proposed public name (ADR 0004); it becomes final when the trademark
 * check and domain registration are done. It is not part of any signed byte. Wire formats are versioned by their
 * own tags, so renaming does not invalidate any signature.
 */
export const PROTOCOL = Object.freeze({
  name: 'Frontier State Protocol',
  short_name: 'FSP',
  name_status: 'proposed',
  version: '0.1.0-draft',
  spec_license: 'CC-BY-4.0',
  code_license: 'Apache-2.0',
  core_modules: ['identity', 'authorization', 'verification'],
  deferred_modules: ['discovery', 'scheduling', 'data_exchange', 'compliance_engine', 'accounting', 'federation'],
  wire_formats: {
    envelope: ENVELOPE_VERSION,
    receipt: RECEIPT_VERSION,
    canonical_json: 'RFC 8785',
    hash_reference: 'sha256 over canonical JSON of the value (strings hashed as JSON strings)',
    timestamp: 'ISO-8601 UTC, Z suffix, optional fraction of up to three digits',
    identity: 'did:key (ed25519)',
    hash: 'sha256'
  },
  record_types: CANONICAL_STATE_RECORD_TYPES,
  payload_profiles: PAYLOAD_PROFILES,
  conformance: { package: '@iricity/frontier-shared/conformance', vectors_version: '3', rule: 'every suite passes, none skipped' }
});
