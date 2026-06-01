import { hashRecord } from '../utils/hash.js';
import { createReceipt } from './receiptEngine.js';

export function createConversionRecord({
  sourceSystem,
  sourceFormat,
  rawRecord,
  normalizedRecord,
  adapterName,
  adapterVersion = '0.1.0',
  conversionRule = 'canonical-normalization'
}) {
  const rawRecordHash = hashRecord(rawRecord);
  const normalizedRecordHash = hashRecord(normalizedRecord);
  const ingestionTime = new Date().toISOString();

  const conversionRecord = {
    record_type: 'conversion',
    source_system: sourceSystem,
    source_format: sourceFormat,
    raw_record_hash: rawRecordHash,
    adapter_name: adapterName,
    adapter_version: adapterVersion,
    normalized_record_hash: normalizedRecordHash,
    conversion_rule: conversionRule,
    ingested_at: ingestionTime
  };

  const receipt = createReceipt(conversionRecord, {
    timestamp: ingestionTime,
    issuer: adapterName
  });

  return {
    conversionRecord,
    receipt
  };
}

