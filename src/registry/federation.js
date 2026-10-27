/**
 * Federation drafts on top of a registry: discovery by node descriptor, and
 * anchoring between registries.
 *
 * Discovery: a node publishes a signed descriptor at /.well-known/frontier-node.json.
 * A registry that fetches it verifies the envelope against the DID the descriptor
 * names, ingests it (so the node's identity record is receipted) and lists it.
 *
 * Anchoring: a registry publishes its chain head at /chain/head as a signed
 * envelope. A peer verifies the head, fetches and verifies the whole chain, and
 * receipts a `chain_anchor` measurement into its own chain. The next anchor of the
 * same peer must find the previously anchored head at the previously anchored
 * position; otherwise the peer has rewritten history, which is recorded as a
 * `chain_conflict` and refused. Anchoring is not consensus: nothing is voted on,
 * each registry's chain stays its own, and a conflict is evidence for an operator.
 */

import { PAYLOAD_PROFILES, createEnvelope, hashPayload, verifyEnvelope, verifyReceiptChain } from '@iricity/frontier-shared';
import { validateProfilePayload } from '../profiles/index.js';

export const DESCRIPTOR_PATH = '/.well-known/frontier-node.json';
export const CHAIN_HEAD_PATH = '/chain/head';
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function clientError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function assertHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw clientError('url must be an absolute http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw clientError('url must use http or https');
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
}

async function fetchJson(fetchImpl, url, timeoutMs = 10000) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw clientError(`${url} answered ${response.status}`, 502);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw clientError(`${url} response exceeds ${MAX_BODY_BYTES} bytes`, 502);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw clientError(`${url} did not return JSON: ${error.message}`, 502);
  }
}

/** The registry's own chain head, signed. */
export function buildChainHeadEnvelope(registry, { created_at } = {}) {
  const identity = registry.identity();
  const head = {
    registry_did: identity.did,
    issuer_name: identity.issuer_name ?? null,
    head: identity.chain_head ?? null,
    length: identity.receipt_count ?? registry.receipts.length,
    timestamp: created_at ?? new Date().toISOString()
  };
  return createEnvelope({ payload: head, payload_type: PAYLOAD_PROFILES.CHAIN_HEAD, signer: registry.signer, created_at: head.timestamp });
}

/** Nodes known from descriptors this registry has ingested. */
export function listNodes(registry) {
  const byDid = new Map();
  for (const record of registry.records) {
    if (record.record_type === 'entity' && record.payload_profile === PAYLOAD_PROFILES.NODE_DESCRIPTOR && record.did) {
      byDid.set(record.did, {
        node_id: record.entity_id,
        did: record.did,
        name: record.display_name ?? null,
        operator: record.controller_id,
        public_url: record.payload?.public_url ?? null,
        site: record.payload?.site ?? null,
        endpoints: record.payload?.endpoints ?? {},
        descriptor_hash: record.payload_hash,
        envelope_hash: record.envelope_hash ?? null,
        discovered_at: record.discovered_at ?? record.created_at
      });
    }
  }
  return [...byDid.values()];
}

/** Fetch, verify and ingest a node's descriptor. */
export async function discoverNode(registry, url, { fetchImpl = globalThis.fetch } = {}) {
  const base = assertHttpUrl(url);
  const envelope = await fetchJson(fetchImpl, `${base}${DESCRIPTOR_PATH}`);
  const descriptor = envelope?.payload;
  const shape = validateProfilePayload('node-descriptor', descriptor);
  if (!shape.ok) throw clientError(`descriptor rejected: ${shape.errors.join(', ')}`, 422);
  const verification = verifyEnvelope(envelope, { expected_signer: descriptor.did, allowed_payload_types: [PAYLOAD_PROFILES.NODE_DESCRIPTOR] });
  if (!verification.verified) throw clientError(`descriptor envelope rejected: ${verification.errors.join(', ')}`, 422);

  const result = registry.ingestEnvelope({ ...envelope });
  const node = listNodes(registry).find((entry) => entry.did === descriptor.did);
  return { node, record: result.record, receipt: result.receipt, source_url: `${base}${DESCRIPTOR_PATH}` };
}

function anchorsOf(registry, peerDid = null) {
  return registry.records
    .filter((record) => record.record_type === 'measurement' && record.measurement_type === 'chain_anchor' && (!peerDid || record.value?.peer_did === peerDid))
    .map((record) => ({ ...record.value, record_hash: record.record_hash, anchored_by: record.sensor_id }));
}

export function listAnchors(registry, peerDid = null) {
  return anchorsOf(registry, peerDid);
}

export function listConflicts(registry) {
  return registry.records
    .filter((record) => record.record_type === 'measurement' && record.measurement_type === 'chain_conflict')
    .map((record) => ({ ...record.value, record_hash: record.record_hash, recorded_by: record.sensor_id }));
}

/**
 * Anchor a peer registry: verify its head and its whole chain, check it still
 * contains what was anchored before, and receipt the result into this chain.
 */
export async function anchorRegistry(registry, url, { fetchImpl = globalThis.fetch } = {}) {
  const base = assertHttpUrl(url);
  const identity = registry.identity();
  const envelope = await fetchJson(fetchImpl, `${base}${CHAIN_HEAD_PATH}`);
  const head = envelope?.payload;
  const shape = validateProfilePayload('chain-head', head);
  if (!shape.ok) throw clientError(`chain head rejected: ${shape.errors.join(', ')}`, 422);
  const verification = verifyEnvelope(envelope, { expected_signer: head.registry_did, allowed_payload_types: [PAYLOAD_PROFILES.CHAIN_HEAD] });
  if (!verification.verified) throw clientError(`chain head envelope rejected: ${verification.errors.join(', ')}`, 422);
  if (head.registry_did === identity.did) throw clientError('a registry does not anchor itself', 409);

  const listing = await fetchJson(fetchImpl, `${base}/demo/receipts`);
  const receipts = Array.isArray(listing?.receipts) ? listing.receipts : [];
  const chain = receipts.length ? verifyReceiptChain(receipts, { expected_issuer: head.registry_did }) : { verified: true, errors: [], length: 0, head: null };
  if (!chain.verified) throw clientError(`peer chain failed verification: ${chain.errors.join('; ')}`, 422);
  const actualHead = receipts.length ? receipts[receipts.length - 1].receipt_hash : null;
  if (receipts.length !== head.length || actualHead !== head.head) {
    throw clientError(`peer chain (${receipts.length}, ${actualHead}) does not match its published head (${head.length}, ${head.head})`, 422);
  }

  const verifiedAt = new Date().toISOString();
  const previous = anchorsOf(registry, head.registry_did).at(-1) ?? null;
  if (previous) {
    const stillThere = previous.length === 0
      ? true
      : previous.length <= receipts.length && receipts[previous.length - 1]?.receipt_hash === previous.head;
    if (!stillThere) {
      const conflict = {
        peer_did: head.registry_did,
        peer_url: base,
        anchored_head: previous.head,
        anchored_length: previous.length,
        observed_head: actualHead,
        observed_length: receipts.length,
        detected_at: verifiedAt
      };
      registry.ingest({
        record_type: 'measurement',
        sensor_id: identity.did,
        measurement_type: 'chain_conflict',
        value: conflict,
        unit: 'receipt',
        timestamp: verifiedAt,
        source: 'registry_anchor',
        payload_profile: PAYLOAD_PROFILES.CHAIN_HEAD,
        payload_hash: hashPayload(head)
      });
      throw Object.assign(clientError(`peer ${head.registry_did} no longer contains the anchored head ${previous.head} at position ${previous.length}; conflict recorded`, 409), { conflict });
    }
  }

  const anchor = {
    peer_did: head.registry_did,
    peer_url: base,
    head: head.head,
    length: head.length,
    peer_timestamp: head.timestamp,
    verified_at: verifiedAt,
    previous_anchor_head: previous?.head ?? null
  };
  const result = registry.ingest({
    record_type: 'measurement',
    sensor_id: identity.did,
    measurement_type: 'chain_anchor',
    value: anchor,
    unit: 'receipt',
    timestamp: verifiedAt,
    source: 'registry_anchor',
    payload_profile: PAYLOAD_PROFILES.CHAIN_HEAD,
    payload_hash: hashPayload(head)
  });
  return { anchor: { ...anchor, record_hash: result.record.record_hash, anchored_by: identity.did }, receipt: result.receipt, chain_length_verified: receipts.length };
}
