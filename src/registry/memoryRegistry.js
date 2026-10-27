import { validateRecord, validateWithSchema } from '../utils/validateRecord.js';
import { createReceipt, verifyChain, verifyReceipt } from '../engine/receiptEngine.js';
import { hashRecord } from '../utils/hash.js';
import { schemas } from '../schemas/recordSchemas.js';
import { recordFromEnvelopePayload } from '../profiles/index.js';
import {
  buildStateBridgeSummary,
  generateEd25519KeyPair,
  hashPayload,
  recordSubjectId,
  resolveSigner,
  verifyEnvelope,
  verifyAuthorizationCredential,
  verifyReceiptRecord
} from '@iricity/frontier-shared';

function subjectOf(record) {
  return recordSubjectId(record) ?? 'unknown';
}

/** Rules the JSON Schema cannot express; enforced on ingest. */
export function validateRecordSemantics(record) {
  const errors = [];
  if (record.record_type === 'authorization') {
    const bands = Array.isArray(record.bands) ? record.bands : [];
    if (record.capability === 'transmit' && bands.length === 0) {
      errors.push('a transmit authorization must declare at least one band');
    }
    for (const band of bands) {
      if (!(Number.isFinite(band?.lower_hz) && Number.isFinite(band?.upper_hz) && band.lower_hz < band.upper_hz)) {
        errors.push('each band needs numeric lower_hz < upper_hz');
      }
    }
    if (record.valid_from && record.valid_until && new Date(record.valid_until) < new Date(record.valid_from)) {
      errors.push('valid_until precedes valid_from');
    }
    // A regulator-issued authorization must carry a credential that verifies and is
    // bound to this record; an attested one must, when it carries a proof. The
    // credential is checked at the record's own valid_from: a registry keeps history,
    // and whether a licence is current now is a query-time question.
    const needsCredential = record.profile === 'regulator_issued' || (record.profile === 'operator_attested' && record.proof !== null && record.proof !== undefined);
    if (needsCredential) {
      const credential = verifyAuthorizationCredential(record, { at: record.valid_from ?? new Date() });
      if (!credential.verified) errors.push(`authorization proof does not verify: ${credential.errors.join('; ')}`);
    }
  }
  if (record.record_type === 'entity' && record.identity_type && record.status) {
    if (!['active', 'suspended', 'revoked', 'superseded'].includes(record.status)) {
      errors.push('identity records use status active, suspended, revoked or superseded');
    }
  }
  if (record.record_type === 'receipt') {
    const verification = verifyReceiptRecord(record);
    if (!verification.verified) errors.push(`receipt record does not verify: ${verification.errors.join('; ')}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * In-memory reference registry.
 *
 * Every accepted record gets a receipt, and receipts form one append-only chain
 * per registry. The receipt commits to the record exactly as submitted, so a third
 * party can verify it against the object they sent. The registry signs with the
 * supplied signer; when none is given it generates an ephemeral key so receipts are
 * still real signatures, and says so.
 */
export class InMemoryStateRegistry {
  constructor({ signer = null, issuerName = 'state-registry' } = {}) {
    this.records = [];
    this.receipts = [];
    this.conversions = [];
    this.bridgeArtifacts = [];
    this.issuerName = issuerName;

    if (signer) {
      this.signer = resolveSigner(signer);
      this.signerMode = 'configured';
    } else {
      const pair = generateEd25519KeyPair();
      this.signer = { did: pair.did, private_key: pair.private_key };
      this.signerMode = 'ephemeral';
    }
  }

  identity() {
    return {
      did: this.signer.did,
      issuer_name: this.issuerName,
      signer_mode: this.signerMode,
      receipt_count: this.receipts.length,
      chain_head: this.receipts.length ? this.receipts[this.receipts.length - 1].receipt_hash : null
    };
  }

  #previousHash() {
    return this.receipts.length ? this.receipts[this.receipts.length - 1].receipt_hash : null;
  }

  #issueReceipt(record, timestamp) {
    const receipt = createReceipt(record, {
      signer: this.signer,
      previousHash: this.#previousHash(),
      timestamp
    });
    this.receipts.push(receipt);
    return receipt;
  }

  /** Validate and store a record exactly as submitted; the receipt commits to that object. */
  ingest(record) {
    const recordType = record?.record_type;
    const validation = validateRecord(recordType, record);
    if (!validation.ok) {
      throw new Error(`invalid ${recordType} record: ${validation.errors.join(', ')}`);
    }
    const semantics = validateRecordSemantics(record);
    if (!semantics.ok) {
      throw new Error(`invalid ${recordType} record: ${semantics.errors.join(', ')}`);
    }

    const receipt = this.#issueReceipt(record);
    const storedRecord = {
      ...record,
      record_hash: receipt.record_hash,
      subject_id: record.subject_id ?? subjectOf(record)
    };
    this.records.push(storedRecord);

    return { record: storedRecord, receipt };
  }

  /**
   * Ingest a signed envelope. The envelope must verify and match the envelope schema;
   * the payload is wrapped according to its payload_type and stored with the
   * envelope hash and signer attached.
   */
  ingestEnvelope(envelope) {
    const verification = verifyEnvelope(envelope);
    if (!verification.verified) {
      throw new Error(`envelope rejected: ${verification.errors.join(', ')}`);
    }
    const shape = validateWithSchema(schemas.envelope, envelope);
    if (!shape.ok) {
      throw new Error(`envelope rejected: ${shape.errors.join(', ')}`);
    }
    if (!('payload' in envelope) || envelope.payload === undefined) {
      throw new Error('envelope rejected: payload body is required for ingest');
    }

    const wrapped = recordFromEnvelopePayload(envelope.payload_type, envelope.payload, {
      signer: envelope.signer,
      timestamp: envelope.created_at
    });
    const record = { ...wrapped, envelope_hash: envelope.envelope_hash, signer: envelope.signer };
    const result = this.ingest(record);
    return { ...result, envelope_verification: verification };
  }

  ingestConversion(conversionRecord, submittedReceipt) {
    const registryReceipt = this.#issueReceipt(conversionRecord);
    const entry = { conversionRecord, receipt: registryReceipt, submittedReceipt };
    this.conversions.push(entry);
    return entry;
  }

  /**
   * Ingest a bridge artifact from an applied stack. The submitted receipt must be a
   * protocol receipt that verifies against the conversion record; the normalized
   * record must match the hash the conversion record names; the summary is always
   * recomputed here and never trusted from the submission.
   */
  ingestBridgeArtifact(bridgeArtifact) {
    if (!bridgeArtifact || typeof bridgeArtifact !== 'object' || Array.isArray(bridgeArtifact)) {
      throw new Error('invalid bridge artifact');
    }

    const normalizedRecord = bridgeArtifact.normalized_record;
    const conversionRecord = bridgeArtifact.conversion_record;
    const receipt = bridgeArtifact.receipt;

    if (!normalizedRecord || !conversionRecord) {
      throw new Error('bridge artifact requires normalized_record and conversion_record');
    }
    if (!receipt || typeof receipt !== 'object' || receipt.record_type !== 'receipt') {
      throw new Error('bridge artifact requires a protocol receipt');
    }

    const normalizedValidation = validateRecord(normalizedRecord.record_type, normalizedRecord);
    if (!normalizedValidation.ok) {
      throw new Error(`invalid normalized record: ${normalizedValidation.errors.join(', ')}`);
    }
    const conversionValidation = validateRecord('conversion', conversionRecord);
    if (!conversionValidation.ok) {
      throw new Error(`invalid conversion record: ${conversionValidation.errors.join(', ')}`);
    }
    if (hashPayload(normalizedRecord) !== conversionRecord.normalized_record_hash) {
      throw new Error('normalized_record does not match conversion_record.normalized_record_hash');
    }
    const receiptValidation = validateRecord('receipt', receipt);
    if (!receiptValidation.ok) {
      throw new Error(`invalid bridge receipt: ${receiptValidation.errors.join(', ')}`);
    }
    const receiptVerification = verifyReceipt(receipt, { record: conversionRecord });
    if (!receiptVerification.verified) {
      throw new Error(`bridge receipt failed verification: ${receiptVerification.errors.join(', ')}`);
    }

    const normalizedResult = this.ingest(normalizedRecord);
    const conversionResult = this.ingestConversion(conversionRecord, receipt);
    const summary = buildStateBridgeSummary({
      event: bridgeArtifact.event || null,
      analysis: bridgeArtifact.analysis || null,
      receipt,
      run: bridgeArtifact.run || null,
      normalizedRecord,
      conversionRecord,
      bridgeType: bridgeArtifact.bridge_type || 'state_stack_conversion'
    });

    const storedBridge = {
      bridge_id: summary.bridge_id,
      bridge_type: summary.bridge_type,
      summary,
      normalized_record: normalizedResult.record,
      conversion_record: conversionResult.conversionRecord,
      receipt,
      receipt_verification: receiptVerification,
      identity_bound: receiptVerification.identity_bound,
      registry_receipts: {
        normalized_record: normalizedResult.receipt.receipt_id,
        conversion_record: conversionResult.receipt.receipt_id
      },
      event: bridgeArtifact.event || null,
      analysis: bridgeArtifact.analysis || null,
      run: bridgeArtifact.run || null,
      ingested_at: summary.issued_at || normalizedResult.record.created_at || new Date().toISOString()
    };

    this.bridgeArtifacts.push(storedBridge);

    return {
      bridge: storedBridge,
      record: normalizedResult.record,
      receipt: normalizedResult.receipt,
      conversion_record: conversionResult.conversionRecord,
      conversion_receipt: conversionResult.receipt
    };
  }

  list() {
    return [...this.records];
  }

  listReceipts() {
    return [...this.receipts];
  }

  getReceiptById(receiptId) {
    return this.receipts.find((receipt) => receipt.receipt_id === receiptId) || null;
  }

  verifyReceiptById(receiptId) {
    const receipt = this.getReceiptById(receiptId);
    if (!receipt) return null;
    const index = this.receipts.indexOf(receipt);
    const stored = this.records.find((item) => item.record_hash === receipt.record_hash);
    let record;
    if (stored) {
      const { record_hash, subject_id, ...original } = stored;
      record = original;
    } else {
      const conversion = this.conversions.find((item) => hashRecord(item.conversionRecord) === receipt.record_hash);
      record = conversion?.conversionRecord;
    }
    return verifyReceipt(receipt, {
      record,
      previous_receipt: index > 0 ? this.receipts[index - 1] : undefined,
      expected_issuer: this.signer.did
    });
  }

  verifyChain() {
    return verifyChain(this.receipts, { require_genesis: true, expected_issuer: this.signer.did });
  }

  listBridgeArtifacts(filters = {}) {
    const sourceSystem = filters.source_system || null;
    const bridgeType = filters.bridge_type || null;
    return this.bridgeArtifacts
      .filter((bridge) => {
        const summary = bridge.summary || {};
        if (sourceSystem && summary.source_system !== sourceSystem) return false;
        if (bridgeType && summary.bridge_type !== bridgeType) return false;
        return true;
      })
      .map((bridge) => bridge.summary);
  }

  getBridgeArtifactById(bridgeId) {
    return this.bridgeArtifacts.find((bridge) => bridge.bridge_id === bridgeId || bridge.summary?.bridge_id === bridgeId) || null;
  }

  timeline(subjectId) {
    if (typeof subjectId !== 'string' || subjectId.length === 0) return [];
    return this.records.filter((record) => record.subject_id === subjectId);
  }

  bridgeTimeline(subjectId, filters = {}) {
    const sourceSystem = filters.source_system || null;
    const bridgeType = filters.bridge_type || null;
    return this.bridgeArtifacts
      .filter((bridge) => {
        const summary = bridge.summary || {};
        if (sourceSystem && summary.source_system !== sourceSystem) return false;
        if (bridgeType && summary.bridge_type !== bridgeType) return false;
        return (
          summary.normalized_subject_id === subjectId ||
          summary.source_event_id === subjectId ||
          summary.run_id === subjectId
        );
      })
      .map((bridge) => bridge.summary);
  }

  bridgeSummary(filters = {}) {
    const bridges = this.listBridgeArtifacts(filters);
    const byBridgeType = Object.create(null);
    const bySourceSystem = Object.create(null);
    const byRecordType = Object.create(null);
    const byStatus = Object.create(null);

    for (const bridge of bridges) {
      byBridgeType[bridge.bridge_type || 'unknown'] = (byBridgeType[bridge.bridge_type || 'unknown'] || 0) + 1;
      bySourceSystem[bridge.source_system || 'unknown'] = (bySourceSystem[bridge.source_system || 'unknown'] || 0) + 1;
      byRecordType[bridge.normalized_record_type || 'unknown'] = (byRecordType[bridge.normalized_record_type || 'unknown'] || 0) + 1;
      byStatus[bridge.status || 'unknown'] = (byStatus[bridge.status || 'unknown'] || 0) + 1;
    }

    return {
      total: bridges.length,
      filters: {
        source_system: filters.source_system || null,
        bridge_type: filters.bridge_type || null
      },
      by_bridge_type: byBridgeType,
      by_source_system: bySourceSystem,
      by_record_type: byRecordType,
      by_status: byStatus,
      latest_bridge: bridges[0] || null
    };
  }
}
