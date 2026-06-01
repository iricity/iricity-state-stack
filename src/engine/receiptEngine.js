import { hashRecord, sha256Hex } from '../utils/hash.js';

export function createReceipt(record, options = {}) {
  const recordHash = hashRecord(record);
  const timestamp = options.timestamp ?? new Date().toISOString();
  const issuer = options.issuer ?? 'iricity-state-stack';
  const previousHash = options.previousHash ?? null;

  const signature = sha256Hex([recordHash, previousHash ?? '', issuer, timestamp].join('|'));

  return {
    record_type: 'receipt',
    receipt_id: options.receiptId ?? `rcp_${recordHash.slice(0, 16)}`,
    record_hash: recordHash,
    previous_hash: previousHash,
    timestamp,
    issuer,
    signature,
    verification_status: 'issued'
  };
}

