'use strict';

/**
 * @fileoverview HTTP load testing tool with statistics.
 * @module loadspike
 * @author idirdev
 */

const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

/**
 * Compute a percentile value from a sorted numeric array.
 * @param {number[]} sorted - Sorted array (ascending).
 * @param {number} p - Percentile 0–100.
 * @returns {number}
 */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Send a single HTTP request with timing.
 * @param {string} url - Target URL.
 * @param {{ method?: string, headers?: object, body?: string, timeout?: number }} opts
 * @returns {Promise<{ statusCode: number, duration: number, error: string|null }>}
 */
function sendRequest(url, opts = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? Buffer.from(opts.body) : null;

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers: Object.assign(
        body ? { 'Content-Length': body.length } : {},
        opts.headers || {}
      ),
    };

    const req = transport.request(reqOpts, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, duration: Date.now() - start, error: null });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 0, duration: Date.now() - start, error: err.message });
    });

    if (opts.timeout) {
      req.setTimeout(opts.timeout, () => {
        req.destroy();
        resolve({ statusCode: 0, duration: Date.now() - start, error: 'timeout' });
      });
    }

    if (body) req.write(body);
    req.end();
  });
}

/**
 * Run a load test against a URL.
 * @param {string} url - Target URL.
 * @param {{ concurrency?: number, totalRequests?: number, method?: string, headers?: object, body?: string, timeout?: number }} opts
 * @returns {Promise<{
 *   totalRequests: number, successful: number, failed: number,
 *   totalTime: number, avg: number, min: number, max: number,
 *   p50: number, p95: number, p99: number, rps: number,
 *   statusCodes: object, errors: string[]
 * }>}
 */
async function loadTest(url, opts = {}) {
  const concurrency = opts.concurrency || 10;
  const totalRequests = opts.totalRequests || 100;
  const durations = [];
  const statusCodes = {};
  const errors = [];
  let successful = 0;
  let failed = 0;
  let completed = 0;

  const testStart = Date.now();

  async function runWorker(count) {
    for (let i = 0; i < count; i++) {
      const { statusCode, duration, error } = await sendRequest(url, opts);
      durations.push(duration);
      if (error) {
        failed++;
        errors.push(error);
      } else {
        successful++;
        statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
      }
      completed++;
    }
  }

  const perWorker = Math.floor(totalRequests / concurrency);
  const remainder = totalRequests % concurrency;
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    const count = perWorker + (i < remainder ? 1 : 0);
    if (count > 0) workers.push(runWorker(count));
  }

  await Promise.all(workers);

  const totalTime = Date.now() - testStart;
  const sorted = durations.slice().sort((a, b) => a - b);
  const avg = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
  const min = sorted.length ? sorted[0] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;

  return {
    totalRequests: completed,
    successful,
    failed,
    totalTime,
    avg: Math.round(avg),
    min,
    max,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    rps: totalTime > 0 ? Math.round((completed / totalTime) * 1000) : 0,
    statusCodes,
    errors: [...new Set(errors)],
  };
}

/**
 * Format a stats report as a readable string.
 * @param {object} stats - Result from loadTest().
 * @returns {string}
 */
function formatReport(stats) {
  return [
    '=== Load Test Report ===',
    `Total requests : ${stats.totalRequests}`,
    `Successful     : ${stats.successful}`,
    `Failed         : ${stats.failed}`,
    `Total time     : ${stats.totalTime}ms`,
    `Avg latency    : ${stats.avg}ms`,
    `Min latency    : ${stats.min}ms`,
    `Max latency    : ${stats.max}ms`,
    `p50            : ${stats.p50}ms`,
    `p95            : ${stats.p95}ms`,
    `p99            : ${stats.p99}ms`,
    `RPS            : ${stats.rps}`,
    `Status codes   : ${JSON.stringify(stats.statusCodes)}`,
    stats.errors.length ? `Errors         : ${stats.errors.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Create a load test runner that emits events.
 * @param {string} url - Target URL.
 * @param {{ concurrency?: number, totalRequests?: number, method?: string, headers?: object, body?: string, timeout?: number }} opts
 * @returns {EventEmitter} Emits 'request', 'complete', 'error', 'done'.
 */
function createRunner(url, opts = {}) {
  const emitter = new EventEmitter();
  const concurrency = opts.concurrency || 10;
  const totalRequests = opts.totalRequests || 100;
  const durations = [];
  const statusCodes = {};
  const errors = [];
  let successful = 0;
  let failed = 0;
  let completed = 0;
  const testStart = Date.now();

  async function runWorker(count) {
    for (let i = 0; i < count; i++) {
      emitter.emit('request', { url, attempt: completed + 1 });
      const { statusCode, duration, error } = await sendRequest(url, opts);
      durations.push(duration);
      completed++;
      if (error) {
        failed++;
        errors.push(error);
        emitter.emit('error', { error, duration });
      } else {
        successful++;
        statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
        emitter.emit('complete', { statusCode, duration });
      }
    }
  }

  const perWorker = Math.floor(totalRequests / concurrency);
  const remainder = totalRequests % concurrency;
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    const count = perWorker + (i < remainder ? 1 : 0);
    if (count > 0) workers.push(runWorker(count));
  }

  Promise.all(workers).then(() => {
    const totalTime = Date.now() - testStart;
    const sorted = durations.slice().sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    emitter.emit('done', {
      totalRequests: completed, successful, failed, totalTime,
      avg: Math.round(avg),
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      rps: totalTime > 0 ? Math.round((completed / totalTime) * 1000) : 0,
      statusCodes,
      errors: [...new Set(errors)],
    });
  });

  return emitter;
}

module.exports = { loadTest, sendRequest, percentile, formatReport, createRunner };
