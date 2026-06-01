import test from 'node:test';
import assert from 'node:assert/strict';
import { startStateStackServer } from '../src/server.js';

async function withServer(fn) {
  const server = await startStateStackServer({ port: 0, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('serves health and schema discovery', async () => {
  await withServer(async (baseUrl) => {
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.service, 'iricity-state-stack');

    const schemasRes = await fetch(`${baseUrl}/schemas`);
    assert.equal(schemasRes.status, 200);
    const schemas = await schemasRes.json();
    assert.ok(schemas.schemas.includes('entity'));
    assert.ok(schemas.schemas.includes('receipt'));
  });
});

test('ingests a record and returns a timeline', async () => {
  await withServer(async (baseUrl) => {
    const ingestRes = await fetch(`${baseUrl}/demo/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        record_type: 'measurement',
        sensor_id: 'sensor-demo-1',
        measurement_type: 'temperature',
        value: 24.5,
        unit: 'C',
        timestamp: '2026-01-01T00:00:00Z',
        source: 'demo'
      })
    });

    assert.equal(ingestRes.status, 201);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.record.record_type, 'measurement');
    assert.equal(ingestBody.receipt.record_type, 'receipt');

    const timelineRes = await fetch(`${baseUrl}/demo/timeline?subject_id=sensor-demo-1`);
    assert.equal(timelineRes.status, 200);
    const timelineBody = await timelineRes.json();
    assert.ok(Array.isArray(timelineBody.timeline));
    assert.ok(timelineBody.timeline.some((record) => record.sensor_id === 'sensor-demo-1'));
  });
});

