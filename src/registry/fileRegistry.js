/**
 * File-backed registry: the in-memory registry plus an append-only log on disk.
 *
 * Every accepted ingest appends one JSON line holding exactly what it added
 * (records, receipts, conversions, bridges). On start the log is replayed into
 * memory without re-validating or re-receipting anything, the issuer named in the
 * log header must be the configured signer, and the receipt chain is verified
 * before the registry serves a single request. A durable log needs a durable
 * identity, so an ephemeral signer is refused.
 *
 * The log is the registry's receipt chain made explicit: one line per accepted
 * submission, never rewritten. Copying the file copies the registry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { InMemoryStateRegistry } from './memoryRegistry.js';

export const REGISTRY_LOG_VERSION = 'state-registry-log/1';

export class FileStateRegistry extends InMemoryStateRegistry {
  #path;
  #depth = 0;
  #loadedEntries = 0;

  /**
   * @param {object} args
   * @param {string} args.path        the log file; created with a header when missing
   * @param {object|string} args.signer  key material (PEM, 64-hex seed, or key pair); required
   * @param {string} [args.issuerName]
   */
  constructor({ path: logPath, signer, issuerName } = {}) {
    if (typeof logPath !== 'string' || !logPath.trim()) throw new TypeError('FileStateRegistry needs a log path');
    if (!signer) throw new TypeError('FileStateRegistry needs a configured signer: a durable log needs a durable identity');
    super({ signer, issuerName });
    this.#path = path.resolve(logPath);
    this.#load();
  }

  get path() {
    return this.#path;
  }

  get loadedEntries() {
    return this.#loadedEntries;
  }

  identity() {
    return {
      ...super.identity(),
      persistence: 'file',
      log_path: this.#path,
      log_version: REGISTRY_LOG_VERSION
    };
  }

  #load() {
    if (!fs.existsSync(this.#path)) {
      fs.mkdirSync(path.dirname(this.#path), { recursive: true });
      const header = { log_version: REGISTRY_LOG_VERSION, issuer: this.signer.did, issuer_name: this.issuerName, created_at: new Date().toISOString() };
      fs.writeFileSync(this.#path, `${JSON.stringify(header)}\n`, { flag: 'wx' });
      return;
    }

    const lines = fs.readFileSync(this.#path, 'utf8').split('\n').filter((line) => line.trim().length > 0);
    if (!lines.length) throw new Error(`registry log ${this.#path} is empty; a log starts with a header line`);

    let header;
    try {
      header = JSON.parse(lines[0]);
    } catch (error) {
      throw new Error(`registry log ${this.#path} has an unreadable header: ${error.message}`);
    }
    if (header?.log_version !== REGISTRY_LOG_VERSION) {
      throw new Error(`registry log ${this.#path} is ${header?.log_version ?? 'unversioned'}; this registry reads ${REGISTRY_LOG_VERSION}`);
    }
    if (header.issuer !== this.signer.did) {
      throw new Error(`registry log ${this.#path} was written by ${header.issuer}; the configured signer is ${this.signer.did}`);
    }

    for (let i = 1; i < lines.length; i += 1) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (error) {
        throw new Error(`registry log ${this.#path} line ${i + 1} is unreadable: ${error.message}`);
      }
      if (entry?.type !== 'entry') throw new Error(`registry log ${this.#path} line ${i + 1} is not an entry`);
      for (const key of ['records', 'receipts', 'conversions', 'bridges']) {
        if (!Array.isArray(entry[key])) throw new Error(`registry log ${this.#path} line ${i + 1} lacks ${key}`);
      }
      this.records.push(...entry.records);
      this.receipts.push(...entry.receipts);
      this.conversions.push(...entry.conversions);
      this.bridgeArtifacts.push(...entry.bridges);
      this.#loadedEntries += 1;
    }

    if (this.receipts.length) {
      const chain = this.verifyChain();
      if (!chain.verified) throw new Error(`registry log ${this.#path} failed verification: ${chain.errors.join('; ')}`);
      for (const receipt of this.receipts) {
        if (receipt.issuer !== this.signer.did) {
          throw new Error(`registry log ${this.#path} holds receipt ${receipt.receipt_id} issued by ${receipt.issuer}, not ${this.signer.did}`);
        }
      }
    }
  }

  /** Run a mutation; on success append exactly what it added, on failure leave memory as it was. */
  #capture(fn) {
    const before = {
      records: this.records.length,
      receipts: this.receipts.length,
      conversions: this.conversions.length,
      bridges: this.bridgeArtifacts.length
    };
    this.#depth += 1;
    let result;
    try {
      result = fn();
    } catch (error) {
      if (this.#depth === 1) {
        this.records.length = before.records;
        this.receipts.length = before.receipts;
        this.conversions.length = before.conversions;
        this.bridgeArtifacts.length = before.bridges;
      }
      throw error;
    } finally {
      this.#depth -= 1;
    }

    if (this.#depth === 0) {
      const entry = {
        type: 'entry',
        at: new Date().toISOString(),
        records: this.records.slice(before.records),
        receipts: this.receipts.slice(before.receipts),
        conversions: this.conversions.slice(before.conversions),
        bridges: this.bridgeArtifacts.slice(before.bridges)
      };
      if (entry.records.length || entry.receipts.length || entry.conversions.length || entry.bridges.length) {
        fs.appendFileSync(this.#path, `${JSON.stringify(entry)}\n`);
      }
    }
    return result;
  }

  ingest(record) {
    return this.#capture(() => super.ingest(record));
  }

  ingestEnvelope(envelope) {
    return this.#capture(() => super.ingestEnvelope(envelope));
  }

  ingestConversion(conversionRecord, submittedReceipt) {
    return this.#capture(() => super.ingestConversion(conversionRecord, submittedReceipt));
  }

  ingestBridgeArtifact(bridgeArtifact) {
    return this.#capture(() => super.ingestBridgeArtifact(bridgeArtifact));
  }
}

/**
 * Build the registry the server runs: file-backed when STATE_REGISTRY_PATH is set
 * (which then requires STATE_SIGNING_PRIVATE_KEY), otherwise null so the caller
 * falls back to the in-memory demo.
 */
export function registryFromEnv(env = process.env) {
  const logPath = env.STATE_REGISTRY_PATH;
  if (!logPath) return null;
  const signer = env.STATE_SIGNING_PRIVATE_KEY;
  if (!signer) {
    throw new Error('STATE_REGISTRY_PATH is set but STATE_SIGNING_PRIVATE_KEY is not; a durable registry needs a durable identity');
  }
  return new FileStateRegistry({ path: logPath, signer, issuerName: env.STATE_ISSUER_NAME || 'state-registry' });
}
