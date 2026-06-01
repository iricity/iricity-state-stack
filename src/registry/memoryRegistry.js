import { validateRecord } from '../utils/validateRecord.js';
import { createReceipt } from '../engine/receiptEngine.js';
import { hashRecord } from '../utils/hash.js';

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

  list() {
    return [...this.records];
  }

  timeline(subjectId) {
    return this.records.filter((record) => record.subject_id === subjectId || defaultSubjectId(record) === subjectId);
  }
}

