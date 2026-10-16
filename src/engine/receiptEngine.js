import { createReceiptRecord, verifyReceiptRecord, verifyReceiptChain } from '@iricity/frontier-shared';

/**
 * Receipt engine.
 *
 * Receipts are produced by the shared `state-receipt/1` primitive. When a signer is
 * supplied the receipt is ed25519-signed and its issuer is the signer's did:key;
 * otherwise the receipt is explicitly unsigned (integrity only, no identity).
 *
 * @param {object} record
 * @param {object} [options]
 * @param {object|string} [options.signer]       ed25519 signer (preferred)
 * @param {string} [options.issuer]              plain issuer name for unsigned receipts
 * @param {string|null} [options.previousHash]   previous receipt's receipt_hash
 * @param {string} [options.timestamp]
 * @param {string} [options.receiptId]
 */
export function createReceipt(record, options = {}) {
  return createReceiptRecord({
    record,
    previous_hash: options.previousHash ?? null,
    issuer: options.signer ?? options.issuer ?? 'iricity-state-stack',
    timestamp: options.timestamp,
    receipt_id: options.receiptId
  });
}

export function verifyReceipt(receipt, options = {}) {
  return verifyReceiptRecord(receipt, options);
}

export function verifyChain(receipts, options = {}) {
  return verifyReceiptChain(receipts, options);
}
