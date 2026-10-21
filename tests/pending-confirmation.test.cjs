const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('pending confirmation waits for the exact acknowledged revision', async () => {
  const { pendingConfirmationState: state } = await import('../lib/pending-confirmation.mjs');
  const request = { id: 'nf-1', fingerprint: 'review-v2' };
  const current = { pendingId: 'nf-1', fingerprint: 'review-v2' };
  assert.equal(state(null, current, 'review-v2', ''), 'idle');
  assert.equal(state(request, current, 'review-v1', ''), 'waiting');
  assert.equal(state(request, current, undefined, ''), 'waiting');
  assert.equal(state(request, current, 'review-v2', ''), 'ready');
});

test('never auto-post after edits, note switch, or failed autosave', async () => {
  const { pendingConfirmationState: state } = await import('../lib/pending-confirmation.mjs');
  const request = { id: 'nf-1', fingerprint: 'review-v2' };
  assert.equal(state(request, { pendingId: 'nf-1', fingerprint: 'review-v3' }, 'review-v2', ''), 'changed');
  assert.equal(state(request, { pendingId: 'nf-2', fingerprint: 'review-v2' }, 'review-v2', ''), 'switched');
  assert.equal(state(request, null, 'review-v2', ''), 'switched');
  assert.equal(state(request, { pendingId: 'nf-1', fingerprint: 'review-v2' }, 'review-v2', 'session expired'), 'failed');
});

test('production confirmation UI integrates pending ack with one-click flow', () => {
  const source = readFileSync('pages/index.js', 'utf8');
  assert.match(source, /pendingConfirmRequested\?\.id===id\?0:1200/);
  assert.match(source, /setPendingConfirmRequested\(\{id,fingerprint\}\)/);
  assert.match(source, /pendingConfirmationState\(/);
  assert.match(source, /disabled=\{busy \|\| Boolean\(pendingConfirmRequested\)\}/);
  assert.match(source, /pendingFingerprints\.current\.get\(request\.id\)/);
});
