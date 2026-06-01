import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { CANONICAL_STATE_RECORD_TYPES, buildStateBridgeArtifact } from '@iricity/frontier-shared';
import { InMemoryStateRegistry, schemas, validateRecord } from './index.js';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function createDemoRegistry() {
  const registry = new InMemoryStateRegistry();
  registry.ingest({
    record_type: 'entity',
    entity_id: 'NODE-DEMO-001',
    entity_type: 'demo_node',
    controller_id: 'iricity-state-stack',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    metadata_hash: 'demo'
  });
  registry.ingestBridgeArtifact(
    buildStateBridgeArtifact({
      event: {
        event_id: 'evt-demo-bridge-001',
        source: 'space_stack_demo',
        event_type: 'space_observation',
        timestamp: new Date('2026-01-01T00:00:00Z').toISOString(),
        payload: { note: 'demo bridge event' }
      },
      analysis: {
        analysis_id: 'ana-demo-bridge-001'
      },
      receipt: null,
      run: {
        run_id: 'run-demo-bridge-001',
        completed_at: new Date('2026-01-01T00:00:01Z').toISOString()
      }
    })
  );
  return registry;
}

export function buildStateStackServer({ registry = createDemoRegistry() } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method || 'GET';

    try {
      if (method === 'GET' && path === '/health') {
        return sendJson(res, 200, {
          ok: true,
          service: 'iricity-state-stack',
          mode: 'local_demo'
        });
      }

      if (method === 'GET' && path === '/schemas') {
        return sendJson(res, 200, {
          schemas: CANONICAL_STATE_RECORD_TYPES
        });
      }

      if (method === 'GET' && path === '/demo/timeline') {
        const subjectId = url.searchParams.get('subject_id') || 'NODE-DEMO-001';
        return sendJson(res, 200, {
          subject_id: subjectId,
          timeline: registry.timeline(subjectId)
        });
      }

      if (method === 'GET' && path === '/demo/records') {
        return sendJson(res, 200, {
          records: registry.list()
        });
      }

      if (method === 'GET' && path === '/demo/bridges') {
        const subjectId = url.searchParams.get('subject_id') || null;
        const sourceSystem = url.searchParams.get('source_system') || null;
        const bridgeType = url.searchParams.get('bridge_type') || null;
        const bridges = subjectId
          ? registry.bridgeTimeline(subjectId, { source_system: sourceSystem, bridge_type: bridgeType })
          : registry.listBridgeArtifacts({ source_system: sourceSystem, bridge_type: bridgeType });
        return sendJson(res, 200, {
          subject_id: subjectId,
          source_system: sourceSystem,
          bridge_type: bridgeType,
          bridges
        });
      }

      if (method === 'GET' && path === '/demo/bridges/summary') {
        const sourceSystem = url.searchParams.get('source_system') || null;
        const bridgeType = url.searchParams.get('bridge_type') || null;
        return sendJson(res, 200, registry.bridgeSummary({ source_system: sourceSystem, bridge_type: bridgeType }));
      }

      if (method === 'GET' && path.startsWith('/demo/bridges/')) {
        const bridgeId = decodeURIComponent(path.slice('/demo/bridges/'.length));
        const bridge = registry.getBridgeArtifactById(bridgeId);
        if (!bridge) {
          return sendJson(res, 404, { error: 'bridge not found', bridge_id: bridgeId });
        }
        return sendJson(res, 200, {
          bridge_id: bridge.bridge_id,
          bridge_type: bridge.bridge_type,
          summary: bridge.summary,
          normalized_record: bridge.normalized_record,
          conversion_record: bridge.conversion_record,
          receipt: bridge.receipt
        });
      }

      if (method === 'POST' && path === '/demo/ingest') {
        const body = await readJsonBody(req);
        const recordType = body?.record_type;
        if (!recordType) {
          return sendJson(res, 400, { error: 'record_type is required' });
        }

        const validation = validateRecord(recordType, body);
        if (!validation.ok) {
          return sendJson(res, 400, {
            error: 'invalid record',
            details: validation.errors
          });
        }

        const result = registry.ingest(body);
        return sendJson(res, 201, result);
      }

      if (method === 'POST' && path === '/demo/bridge-ingest') {
        const body = await readJsonBody(req);
        const result = registry.ingestBridgeArtifact(body);
        return sendJson(res, 201, result);
      }

      return sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      return sendJson(res, 500, {
        error: 'internal_error',
        message: error?.message || 'unexpected error'
      });
    }
  });
}

export async function startStateStackServer({ port = process.env.PORT || 8787, host = '127.0.0.1' } = {}) {
  const server = buildStateStackServer();
  await new Promise((resolve) => {
    server.listen(Number(port), host, resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '127.0.0.1';
  startStateStackServer({ port, host }).then(() => {
    process.stdout.write(`iricity-state-stack listening on http://${host}:${port}\n`);
  });
}
