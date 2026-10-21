const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { fixture } = require('./pdf-test-fixture.cjs');

// Exercise the actual compiled API bundle, not merely the worker module symbol.
// Authentication is stubbed only inside this ephemeral CI process. No calls
// reach the real Supabase project, and no live session token is required.
async function verifyCompiledCashExtract() {
  const bundledApi = require('../.next/server/pages/api/cash-extract.js');
  assert.equal(typeof bundledApi.default, 'function');
  const previousFetch = globalThis.fetch;
  let sessionLookups = 0;
  globalThis.fetch = async (resource) => {
    const url = new URL(typeof resource === 'string' ? resource : resource.url);
    if (!url.pathname.endsWith('/rpc/inventory_validate_session')) {
      throw new Error('Unexpected external request in PDF integration test');
    }
    sessionLookups++;
    return new Response(JSON.stringify({
      valid: true,
      user: { id: '11111111-1111-4111-8111-111111111111', role: 'admin' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const req = {
      method: 'POST',
      headers: { 'x-estoque-session': 'a'.repeat(64) },
      body: { base64: fixture().toString('base64') }
    };
    const res = {
      statusCode: 200,
      payload: null,
      setHeader() { return this; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    await bundledApi.default(req, res);
    assert.equal(sessionLookups, 1, 'The API must authenticate exactly once');
    assert.equal(res.statusCode, 200, 'Compiled API returned ' +
      res.statusCode + ': ' + JSON.stringify(res.payload));
    assert.match(res.payload.text, /Fechamento de Caixa/);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function verifyPublishedWorker() {
  // Next.js serves the browser worker as a versioned public module.
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3187'], {
    stdio: 'inherit'
  });
  try {
    let response;
    const { version } = require('pdfjs-dist/package.json');
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        response = await fetch('http://127.0.0.1:3187/vendor/pdf.worker-' + version + '.min.mjs');
        break;
      } catch (error) {
        if (server.exitCode !== null) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    assert.ok(response, 'Next.js server did not start');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(await response.text(),
      readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'), 'utf8'));
  } finally {
    server.kill();
  }
}

async function main() {
  await verifyCompiledCashExtract();
  await verifyPublishedWorker();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
