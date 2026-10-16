import { hashRecord } from '../utils/hash.js';
import { createReceipt } from './receiptEngine.js';

/**
 * Conversion records say how an external format became a canonical record.
 * The source is never discarded: its hash travels with the normalized record.
 */
export function createConversionRecord({
  sourceSystem,
  sourceFormat,
  rawRecord,
  normalizedRecord,
  adapterName,
  adapterVersion = '0.2.0',
  conversionRule = 'canonical-normalization',
  signer = null,
  previousHash = null,
  ingestedAt = new Date().toISOString()
}) {
  const conversionRecord = {
    record_type: 'conversion',
    source_system: sourceSystem,
    source_format: sourceFormat,
    raw_record_hash: hashRecord(rawRecord),
    adapter_name: adapterName,
    adapter_version: adapterVersion,
    normalized_record_hash: hashRecord(normalizedRecord),
    conversion_rule: conversionRule,
    ingested_at: ingestedAt
  };

  const receipt = createReceipt(conversionRecord, {
    timestamp: ingestedAt,
    signer,
    issuer: adapterName,
    previousHash
  });

  return { conversionRecord, receipt };
}
