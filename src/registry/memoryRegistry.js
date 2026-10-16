import { validateRecord } from '../utils/validateRecord.js';
import { createReceipt, verifyChain, verifyReceipt } from '../engine/receiptEngine.js';
import { hashRecord } from '../utils/hash.js';
import {
  buildStateBridgeSummary,
  generateEd25519KeyPair,
  resolveSigner,
  verifyEnvelope
} from '@iricity/frontier-shared';

function defaultSubjectId(record) {
  return (
    record.entity_id ??
    record.subject_id ??
    record.message_id ??
    record.command_id ??
    record.receipt_id ??
    record.transition_id ??
    record.sensor_id ??
    record.source_node ??
    record.resource_type ??
    'unknown'
  );
}

/**
 * In-memory reference registry.
 *
 * Every accepted record gets a receipt, and receipts form one append-only chain
 * per registry. The registry signs with the supplied signer; when none is given
 * it generates an ephemeral key so receipts are still real signatures, and says so.
 */
export class InMemoryStateRegistry {
  constructor({ signer = null, issuerName = 'iricity-state-stack' } = {}) {
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

  ingest(record) {
    const recordType = record?.record_type;
    const validation = validateRecord(recordType, record);
    if (!validation.ok) {
      throw new Error(`invalid ${recordType} record: ${validation.errors.join(', ')}`);
    }

    const storedRecord = {
      ...record,
      record_hash: hashRecord(record),
      subject_id: record.subject_id ?? defaultSubjectId(record)
    };
    const receipt = this.#issueReceipt(storedRecord);
    this.records.push(storedRecord);

    return { record: storedRecord, receipt };
  }

  /**
   * Ingest a signed envelope. The envelope must verify; the payload is stored as the
   * record body when it is a canonical record, otherwise it is wrapped as a
   * measurement with the payload profile preserved.
   */
  ingestEnvelope(envelope) {
    const verification = verifyEnvelope(envelope);
    if (!verification.verified) {
      throw new Error(`envelope rejected: ${verification.errors.join(', ')}`);
    }
    if (envelope.payload === undefined) {
      throw new Error('envelope rejected: payload body is required for ingest');
    }

    const payload = envelope.payload;
    const record = payload && typeof payload === 'object' && typeof payload.record_type === 'string'
      ? { ...payload, envelope_hash: envelope.envelope_hash, signer: envelope.signer }
      : {
          record_type: 'measurement',
          sensor_id: envelope.signer,
          measurement_type: envelope.payload_type,
          value: payload,
          unit: 'opaque',
          payload_profile: envelope.payload_type,
          payload_hash: envelope.payload_hash,
          envelope_hash: envelope.envelope_hash,
          signer: envelope.signer,
          timestamp: envelope.created_at,
          source: envelope.signer
        };

    const result = this.ingest(record);
    return { ...result, envelope_verification: verification };
  }

  ingestConversion(conversionRecord, receipt) {
    this.conversions.push({ conversionRecord, receipt });
    return { conversionRecord, receipt };
  }

  ingestBridgeArtifact(bridgeArtifact) {
    if (!bridgeArtifact || typeof bridgeArtifact !== 'object') {
      throw new Error('invalid bridge artifact');
    }

    const normalizedRecord = bridgeArtifact.normalized_record;
    const conversionRecord = bridgeArtifact.conversion_record;
    const receipt = bridgeArtifact.receipt;

    if (!normalizedRecord || !conversionRecord) {
      throw new Error('bridge artifact requires normalized_record and conversion_record');
    }

    const normalizedValidation = validateRecord(normalizedRecord.record_type, normalizedRecord);
    if (!normalizedValidation.ok) {
      throw new Error(`invalid normalized record: ${normalizedValidation.errors.join(', ')}`);
    }

    const conversionValidation = validateRecord('conversion', conversionRecord);
    if (!conversionValidation.ok) {
      throw new Error(`invalid conversion record: ${conversionValidation.errors.join(', ')}`);
    }

    const bridgeReceipt =
      receipt && receipt.record_type === 'receipt'
        ? receipt
        : createReceipt(conversionRecord, {
            timestamp: bridgeArtifact.summary?.issued_at ?? conversionRecord.ingested_at,
            issuer: bridgeArtifact.summary?.source_system ?? conversionRecord.adapter_name ?? this.issuerName
          });

    const receiptValidation = validateRecord('receipt', bridgeReceipt);
    if (!receiptValidation.ok) {
      throw new Error(`invalid bridge receipt: ${receiptValidation.errors.join(', ')}`);
    }

    const receiptVerification = verifyReceipt(bridgeReceipt, { record: conversionRecord });
    if (!receiptVerification.verified) {
      throw new Error(`bridge receipt failed verification: ${receiptVerification.errors.join(', ')}`);
    }

    const normalizedResult = this.ingest(normalizedRecord);
    const conversionResult = this.ingestConversion(conversionRecord, bridgeReceipt);
    const summary =
      bridgeArtifact.summary ||
      buildStateBridgeSummary({
        event: bridgeArtifact.event || null,
        analysis: bridgeArtifact.analysis || null,
        receipt: bridgeReceipt,
        run: bridgeArtifact.run || null,
        normalizedRecord,
        conversionRecord,
        bridgeType: bridgeArtifact.bridge_type || 'state_stack_conversion'
      });

    const storedBridge = {
      bridge_id: summary.bridge_id,
      bridge_type: bridgeArtifact.bridge_type || summary.bridge_type,
      summary,
      normalized_record: normalizedResult.record,
      conversion_record: conversionResult.conversionRecord,
      receipt: conversionResult.receipt,
      receipt_verification: receiptVerification,
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
    const record = this.records.find((item) => hashRecord(item) === receipt.record_hash) ?? undefined;
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
    return this.records.filter((record) => record.subject_id === subjectId || defaultSubjectId(record) === subjectId);
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
