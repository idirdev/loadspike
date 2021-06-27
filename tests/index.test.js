'use strict';

/**
 * @fileoverview Tests for loadspike against a local HTTP server.
 * @author idirdev
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { loadTest, sendRequest, percentile, formatReport, createRunner } = require('../src/index.js');

// ── percentile ────────────────────────────────────────────────────────────────

test('percentile: p50 of [1,2,3,4,5]', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
});

test('percentile: p100 returns last element', () => {
  const arr = [10, 20, 30];
  assert.equal(percentile(arr, 100), 30);
});

test('percentile: empty array returns 0', () => {
  assert.equal(percentile([], 50), 0);
});

test('percentile: p99 on single element', () => {
  assert.equal(percentile([42], 99), 42);
});

// ── local server tests ────────────────────────────────────────────────────────

function makeServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('sendRequest: GET returns statusCode 200 and duration', async () => {
  const srv = await makeServer((req, res) => { res.writeHead(200); res.end('ok'); });
  const { port } = srv.address();
  try {
    const result = await sendRequest(`http://127.0.0.1:${port}/`);
    assert.equal(result.statusCode, 200);
    assert.ok(typeof result.duration === 'number' && result.duration >= 0);
    assert.equal(result.error, null);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('loadTest: basic stats shape', async () => {
  const srv = await makeServer((req, res) => { res.writeHead(200); res.end('ok'); });
  const { port } = srv.address();
  try {
    const stats = await loadTest(`http://127.0.0.1:${port}/`, { concurrency: 2, totalRequests: 8 });
    assert.equal(stats.totalRequests, 8);
    assert.ok(stats.successful > 0);
    assert.ok(typeof stats.avg === 'number');
    assert.ok(typeof stats.p50 === 'number');
    assert.ok(typeof stats.p95 === 'number');
    assert.ok(typeof stats.p99 === 'number');
    assert.ok(typeof stats.rps === 'number');
    assert.ok(typeof stats.statusCodes === 'object');
    assert.ok(Array.isArray(stats.errors));
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('loadTest: p50 <= p95 <= p99', async () => {
  const srv = await makeServer((req, res) => { res.writeHead(200); res.end('ok'); });
  const { port } = srv.address();
  try {
    const stats = await loadTest(`http://127.0.0.1:${port}/`, { concurrency: 3, totalRequests: 12 });
    assert.ok(stats.p50 <= stats.p95);
    assert.ok(stats.p95 <= stats.p99);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('loadTest: POST with body', async () => {
  let receivedBody = '';
  const srv = await makeServer((req, res) => {
    req.on('data', (c) => { receivedBody += c; });
    req.on('end', () => { res.writeHead(201); res.end('created'); });
  });
  const { port } = srv.address();
  try {
    const stats = await loadTest(`http://127.0.0.1:${port}/`, {
      concurrency: 1, totalRequests: 1, method: 'POST', body: 'hello=world',
    });
    assert.equal(stats.successful, 1);
    assert.equal(stats.statusCodes[201], 1);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('loadTest: failed requests recorded on connection error', async () => {
  // Port 1 is typically unreachable/refused
  const stats = await loadTest('http://127.0.0.1:1/', { concurrency: 1, totalRequests: 1, timeout: 1000 });
  assert.equal(stats.failed, 1);
  assert.ok(stats.errors.length > 0);
});

// ── formatReport ──────────────────────────────────────────────────────────────

test('formatReport: returns non-empty string with expected keys', () => {
  const stats = {
    totalRequests: 10, successful: 10, failed: 0, totalTime: 500,
    avg: 50, min: 10, max: 100, p50: 45, p95: 90, p99: 100,
    rps: 20, statusCodes: { 200: 10 }, errors: [],
  };
  const report = formatReport(stats);
  assert.ok(typeof report === 'string' && report.length > 0);
  assert.ok(report.includes('10'));
  assert.ok(report.includes('p50'));
  assert.ok(report.includes('p95'));
});

test('createRunner: emits done event with stats', async () => {
  const srv = await makeServer((req, res) => { res.writeHead(200); res.end('ok'); });
  const { port } = srv.address();
  try {
    await new Promise((resolve, reject) => {
      const runner = createRunner(`http://127.0.0.1:${port}/`, { concurrency: 2, totalRequests: 4 });
      runner.on('done', (stats) => {
        try {
          assert.equal(stats.totalRequests, 4);
          assert.ok(typeof stats.p50 === 'number');
          resolve();
        } catch (e) { reject(e); }
      });
      runner.on('error', () => {});
    });
  } finally {
    await new Promise((r) => srv.close(r));
  }
});
