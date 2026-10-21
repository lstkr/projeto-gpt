const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { fixture } = require('./pdf-test-fixture.cjs');

async function main() {
  // Load Next.js's production server with a test-only authenticated RPC mock.
  // The mock intercepts and blocks outbound HTTP; no production database is used.
  const server = spawn(process.execPath, [
    '--require', path.resolve(__dirname, 'mock-pdf-session.cjs'),
    require.resolve('next/dist/bin/next'), 'start', '-p', '3187'
  ], { stdio: 'inherit' });
  try {
    let workerResponse;
    const { version } = require('pdfjs-dist/package.json');
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        workerResponse = await fetch('http://127.0.0.1:3187/vendor/pdf.worker-' +
          version + '.min.mjs');
        break;
      } catch (error) {
        if (server.exitCode !== null) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    assert.ok(workerResponse, 'Next.js production server did not start');
    assert.equal(workerResponse.status, 200);
    assert.match(workerResponse.headers.get('content-type'), /javascript/);
    assert.equal(await workerResponse.text(),
      readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'), 'utf8'));

    const response = await fetch('http://127.0.0.1:3187/api/cash-extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-estoque-session': 'a'.repeat(64) },
      body: JSON.stringify({ base64: fixture().toString('base64') })
    });
    const payload = await response.json();
    assert.equal(response.status, 200, 'Compiled cash extraction API returned ' +
      response.status + ': ' + JSON.stringify(payload));
    assert.match(payload.text, /Fechamento de Caixa/);
  } finally {
    server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
