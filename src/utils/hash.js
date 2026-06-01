import crypto from 'node:crypto';
import { canonicalJson } from './canonicalJson.js';

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function hashRecord(record) {
  return sha256Hex(canonicalJson(record));
}

