#!/usr/bin/env node
'use strict';

// Non-destructive smoke checks of the published application.
// Only GETs public files and sends unauthorized requests with NO valid token.
// Does not attempt to log in, upload a fiscal receipt, or modify stock.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');

const smokeUrl = process.env.ESTOQUE_SMOKE_URL?.trim();
if (!smokeUrl) {
  console.error('Smoke failed: ESTOQUE_SMOKE_URL is required and must not be empty.');
  process.exit(1);
}
const BASE = smokeUrl.replace(/\/$/, '');
const origin = new URL(BASE);
assert.equal(origin.protocol, 'https:', 'Only HTTPS production URLs are allowed.');
assert.equal(origin.username, '');
assert.equal(origin.password, '');
assert.equal(origin.search, '');
assert.equal(origin.pathname, '/');
const version = JSON.parse(readFileSync('package.json', 'utf8')).dependencies['pdfjs-dist'];
assert.match(version, /^\d+\.\d+\.\d+$/, 'Worker version must be pinned in package.json.');

async function check(path, options, expected, purpose) {
  const target = new URL(path, BASE + '/');
  assert.equal(target.origin, origin.origin, 'Cross-origin request is forbidden.');
  const response = await fetch(target, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: {'accept': 'application/json', ...(options?.headers || {})}
  });
  assert.equal(response.status, expected,
    `${purpose}: expected HTTP ${expected}, got ${response.status} at ${target.pathname}`);
  assert.ok(!response.headers.get('location'), 'Unexpected redirect.');
  console.log(`OK ${response.status} ${target.pathname} — ${purpose}`);
  return response;
}

async function main() {
  const home = await check('/', undefined, 200, 'public homepage');
  assert.match(home.headers.get('content-type') || '', /text\/html/);
  assert.match(await home.text(), /_next\/static\//, 'Next.js assets missing from homepage');

  const workerPath = `/vendor/pdf.worker-${version}.min.mjs`;
  const worker = await check(workerPath, undefined, 200, 'published PDF.js worker');
  assert.match(worker.headers.get('content-type') || '', /javascript|ecmascript/);
  const workerText = await worker.text();
  assert.ok(workerText.length > 1000, 'PDF.js worker appears truncated');
  assert.ok(workerText.includes(`pdfjsVersion = ${version}`),
    'Published PDF.js worker does not match the pinned version');

  const protectedApis = ['/api/cash-extract', '/api/consulta-nfce', '/api/qr-externo'];
  for (const endpoint of protectedApis) {
    const unauthorized = await check(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}'
    }, 401, 'POST without session denied');
    assert.match(unauthorized.headers.get('cache-control') || '', /no-store/);
    const payload = await unauthorized.json();
    assert.match(payload.error || '', /sessão|session|acesso|autentica/i);
    await check(endpoint, {method: 'GET'}, 405, 'GET method not allowed');
  }
  console.log('Smoke pass: 2 public assets, 3 denied anonymous POSTs, 3 rejected GETs.');
  console.log('NOT TESTED: authenticated UI, scanned PDFs, fiscal provider, stock writes.');
}

main().catch(error => { console.error('Smoke failed:', error.message); process.exitCode = 1; });
