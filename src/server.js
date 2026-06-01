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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}

function renderLandingPage(registry, filters = {}) {
  const summary = registry.bridgeSummary(filters);
  const visibleBridges = registry.listBridgeArtifacts(filters);
  const latestBridge = summary.latest_bridge;
  const recordCount = registry.list().length;
  const receiptCount = registry.receipts.length;
  const conversionCount = registry.conversions.length;
  const bridgeCount = summary.total;
  const sourceSystem = filters.source_system || '';
  const bridgeType = filters.bridge_type || '';
  const bridgeId = latestBridge?.bridge_id || 'n/a';
  const bridgeSummaryHtml = latestBridge
    ? `
      <div class="card">
        <h3>Bridge summary</h3>
        <p class="muted">Latest bridge in the demo registry.</p>
        <div><code>${escapeHtml(latestBridge.bridge_id)}</code></div>
        <p>Source: <code>${escapeHtml(latestBridge.source_system || 'n/a')}</code></p>
        <p>Event: <code>${escapeHtml(latestBridge.source_event_id || 'n/a')}</code></p>
        <p>Normalized type: <code>${escapeHtml(latestBridge.normalized_record_type || 'n/a')}</code></p>
        <p>Receipt: <code>${escapeHtml(latestBridge.receipt_id || 'n/a')}</code></p>
      </div>
    `
    : `
      <div class="card">
        <h3>Bridge summary</h3>
        <p>No bridge artifacts have been ingested yet.</p>
      </div>
    `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Iricity State Stack Demo</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.6;
        color: #e8eef7;
        background: linear-gradient(180deg, #10223d 0%, #07111f 100%);
      }
      .wrap {
        width: min(1100px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 60px;
      }
      .hero, .card, .note {
        border: 1px solid rgba(148, 179, 214, 0.18);
        border-radius: 22px;
        background: rgba(9, 18, 35, 0.9);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }
      .hero {
        padding: 28px;
      }
      .card, .note {
        padding: 20px;
        margin-top: 16px;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .grid.three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .filter-form {
        display: grid;
        gap: 12px;
      }
      .filter-form label {
        display: grid;
        gap: 6px;
        font-weight: 700;
        color: #f4f7fb;
      }
      .filter-form input, .filter-form select {
        width: 100%;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(148, 179, 214, 0.18);
        background: rgba(255, 255, 255, 0.06);
        color: #f4f7fb;
      }
      .bridge-list {
        display: grid;
        gap: 12px;
      }
      .bridge-list .bridge-item {
        padding: 14px;
        border-radius: 16px;
        border: 1px solid rgba(148, 179, 214, 0.18);
        background: rgba(255, 255, 255, 0.04);
      }
      .bridge-list .bridge-item strong {
        display: block;
        margin-bottom: 6px;
      }
      .eyebrow {
        display: inline-block;
        margin-bottom: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        color: #93c5fd;
        border: 1px solid rgba(147, 197, 253, 0.22);
        background: rgba(147, 197, 253, 0.08);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.76rem;
        font-weight: 700;
      }
      h1, h2, h3 {
        margin: 0 0 10px;
      }
      h1 {
        font-size: clamp(2.2rem, 4vw, 3.5rem);
      }
      p {
        color: #b9c7d7;
      }
      code {
        display: inline-block;
        padding: 0.15rem 0.4rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: #e8eef7;
      }
      .kpi {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(148, 179, 214, 0.18);
        background: rgba(255, 255, 255, 0.04);
      }
      .muted {
        color: #b9c7d7;
      }
      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      .pill-row code {
        background: rgba(125, 211, 252, 0.12);
      }
      a {
        color: #93c5fd;
      }
      @media (max-width: 900px) {
        .grid.three, .grid.two {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="hero">
        <span class="eyebrow">State Stack Demo</span>
        <h1>Canonical records, bridge summaries, and replayable provenance.</h1>
        <p>
          This local demo surface shows the canonical foundation records plus the bridge summaries that connect applied stacks back into state.
        </p>
        <div class="pill-row">
          <code>${escapeHtml(bridgeCount)} bridge(s)</code>
          <code>${escapeHtml(recordCount)} record(s)</code>
          <code>${escapeHtml(receiptCount)} receipt(s)</code>
          <code>${escapeHtml(conversionCount)} conversion(s)</code>
        </div>
      </section>
      <section class="grid two">
        <div class="card">
          <h3>Filter bridge summaries</h3>
          <p class="muted">Narrow the demo by source system or bridge type before inspecting the summary and lookup surfaces.</p>
          <form class="filter-form" action="/demo" method="GET">
            <label>
              Source system
              <input name="source_system" type="text" value="${escapeHtml(sourceSystem)}" placeholder="space_stack_demo" />
            </label>
            <label>
              Bridge type
              <select name="bridge_type">
                <option value=""${bridgeType ? '' : ' selected'}>all bridge types</option>
                <option value="state_stack_conversion"${bridgeType === 'state_stack_conversion' ? ' selected' : ''}>state_stack_conversion</option>
              </select>
            </label>
            <div class="pill-row">
              <button class="cta primary" type="submit">Apply filters</button>
              <a class="cta secondary" href="/demo">Clear filters</a>
            </div>
          </form>
        </div>
        <div class="card">
          <h3>Current filter state</h3>
          <div class="pill-row">
            <code>source_system:${escapeHtml(sourceSystem || 'all')}</code>
            <code>bridge_type:${escapeHtml(bridgeType || 'all')}</code>
          </div>
          <p class="muted" style="margin-top:12px;">The summary below reflects the current filter selection, while the quick links remain pointed at the full bridge inspection surface.</p>
        </div>
      </section>
      <section class="grid three">
        <div class="kpi">
          <strong>Total bridge artifacts</strong>
          <h2>${escapeHtml(bridgeCount)}</h2>
          <p class="muted">Ingested bridge artifacts available for summary and filtered review.</p>
        </div>
        <div class="kpi">
          <strong>Canonical records</strong>
          <h2>${escapeHtml(recordCount)}</h2>
          <p class="muted">Normalized state records stored by the demo registry.</p>
        </div>
        <div class="kpi">
          <strong>Bridge ID</strong>
          <h2><code>${escapeHtml(bridgeId)}</code></h2>
          <p class="muted">Latest bridge summary identity.</p>
        </div>
      </section>
      <section class="grid two">
        ${bridgeSummaryHtml}
        <div class="card">
          <h3>What to inspect</h3>
          <p>Use the bridge summary endpoint when you want a compact view of source system, bridge type, and record mix.</p>
          <p>Use the bridge detail endpoint when you want the full normalized record, conversion record, and receipt together.</p>
          <div class="pill-row">
            <code>GET /demo/bridges/summary</code>
            <code>GET /demo/bridges</code>
            <code>GET /demo/bridges/:bridge_id</code>
            <code>POST /demo/bridge-ingest</code>
          </div>
        </div>
      </section>
      <section class="card">
        <h3>Filtered bridge list</h3>
        <p class="muted">These bridge summaries match the current filter state.</p>
        <div class="bridge-list">
          ${visibleBridges.length ? visibleBridges.slice(0, 8).map((bridge) => `
            <div class="bridge-item">
              <strong><code>${escapeHtml(bridge.bridge_id || 'n/a')}</code></strong>
              <p><strong>Source:</strong> <code>${escapeHtml(bridge.source_system || 'n/a')}</code></p>
              <p><strong>Normalized type:</strong> <code>${escapeHtml(bridge.normalized_record_type || 'n/a')}</code></p>
              <p><strong>Receipt:</strong> <code>${escapeHtml(bridge.receipt_id || 'n/a')}</code></p>
            </div>
          `).join('') : `<p class="muted">No bridge summaries match the current filter selection.</p>`}
        </div>
      </section>
      <section class="note">
        <strong>Current contract:</strong>
        <p>
          Applied stacks can emit bridge artifacts into this demo server, and the state layer can summarize or inspect them without re-parsing the raw payload each time.
        </p>
      </section>
    </main>
  </body>
</html>`;
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
      if (method === 'GET' && (path === '/' || path === '/demo')) {
        return sendHtml(res, 200, renderLandingPage(registry, {
          source_system: url.searchParams.get('source_system') || '',
          bridge_type: url.searchParams.get('bridge_type') || ''
        }));
      }

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
