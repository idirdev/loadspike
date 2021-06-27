#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI for loadspike.
 * @author idirdev
 */

const { loadTest, formatReport } = require('../src/index.js');

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('-'));

if (!url) {
  console.log('Usage: loadspike <url> [-c 10] [-n 100] [-m POST] [-H "header:val"] [-d body] [--timeout 5000] [--json]');
  process.exit(1);
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const concurrency = parseInt(getArg('-c') || '10', 10);
const totalRequests = parseInt(getArg('-n') || '100', 10);
const method = getArg('-m') || 'GET';
const body = getArg('-d') || undefined;
const timeout = parseInt(getArg('--timeout') || '5000', 10);
const useJson = args.includes('--json');

const rawHeader = getArg('-H');
const headers = {};
if (rawHeader) {
  const sep = rawHeader.indexOf(':');
  if (sep !== -1) {
    headers[rawHeader.slice(0, sep).trim()] = rawHeader.slice(sep + 1).trim();
  }
}

(async () => {
  console.log(`Starting load test: ${url}`);
  console.log(`Concurrency: ${concurrency}, Requests: ${totalRequests}, Method: ${method}`);
  const stats = await loadTest(url, { concurrency, totalRequests, method, headers, body, timeout });
  if (useJson) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(formatReport(stats));
  }
})();
