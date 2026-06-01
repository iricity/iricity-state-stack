import { validateRecord } from '../utils/validateRecord.js';
import { createReceipt } from '../engine/receiptEngine.js';
import { hashRecord } from '../utils/hash.js';
import { buildStateBridgeSummary } from '@iricity/frontier-shared';

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

export class InMemoryStateRegistry {
  constructor() {
    this.records = [];
    this.receipts = [];
    this.conversions = [];
    this.bridgeArtifacts = [];
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
    const receipt = createReceipt(storedRecord);

    this.records.push(storedRecord);
    this.receipts.push(receipt);

    return {
      record: storedRecord,
      receipt
    };
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
            issuer: bridgeArtifact.summary?.source_system ?? conversionRecord.adapter_name ?? 'iricity-state-stack'
          });

    const receiptValidation = validateRecord('receipt', bridgeReceipt);
    if (!receiptValidation.ok) {
      throw new Error(`invalid bridge receipt: ${receiptValidation.errors.join(', ')}`);
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

  listBridgeArtifacts() {
    return this.bridgeArtifacts.map((bridge) => bridge.summary);
  }

  getBridgeArtifactById(bridgeId) {
    return this.bridgeArtifacts.find((bridge) => bridge.bridge_id === bridgeId || bridge.summary?.bridge_id === bridgeId) || null;
  }

  timeline(subjectId) {
    return this.records.filter((record) => record.subject_id === subjectId || defaultSubjectId(record) === subjectId);
  }

  bridgeTimeline(subjectId) {
    return this.bridgeArtifacts
      .filter(
        (bridge) =>
          bridge.summary?.normalized_subject_id === subjectId ||
          bridge.summary?.source_event_id === subjectId ||
          bridge.summary?.run_id === subjectId
      )
      .map((bridge) => bridge.summary);
  }
}
