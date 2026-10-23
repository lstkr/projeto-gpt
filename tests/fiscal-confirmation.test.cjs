const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('final fiscal review remains blocked until every reviewable item is complete', async () => {
  const { canStartFiscalFinalReview, canConfirmFiscalDocument } = await import('../lib/fiscal-confirmation.mjs');
  const draft = { items: [{ id: 'line-1' }], finalReviewed: false, checkedBy: 'Gestor' };
  assert.equal(canStartFiscalFinalReview(draft, [{ done: false }]), false);
  assert.equal(canStartFiscalFinalReview(draft, [{ done: true }]), true);
  assert.equal(canStartFiscalFinalReview({ ...draft, items: [] }, []), false);
  assert.equal(canConfirmFiscalDocument(draft, [{ done: true }]), false);
});

test('only the explicit final confirmation authorizes a reviewed fiscal draft', async () => {
  const { canConfirmFiscalDocument } = await import('../lib/fiscal-confirmation.mjs');
  const rows = [{ done: true }];
  const draft = { items: [{ id: 'line-1' }], finalReviewed: true, checkedBy: 'Gestor' };
  assert.equal(canConfirmFiscalDocument(draft, rows), true);
  assert.equal(canConfirmFiscalDocument({ ...draft, finalReviewed: false, totalsReviewed: true }, rows), false);
  assert.equal(canConfirmFiscalDocument({ ...draft, checkedBy: '  ' }, rows), false);
  assert.equal(canConfirmFiscalDocument(draft, [{ done: false }]), false);
});

test('removing the duplicate checkbox preserves divergence warnings and edit invalidation', () => {
  const source = readFileSync('pages/index.js', 'utf8');
  assert.doesNotMatch(source, /totalsReviewed/);
  assert.doesNotMatch(source, /Conferi o subtotal, descontos, acréscimos e total final/);
  assert.match(source, /Conferi o documento, inclusive os totais e divergências sinalizadas, e autorizo a entrada no estoque/);
  assert.match(source, /financialWarnings\.length && !window\.confirm/);
  assert.match(source, /finalReviewed: key === 'checkedBy' \? d\.finalReviewed : false/);
  assert.match(source, /finalReviewed:\s*false,\s*officialVerified:\s*false/);
  assert.match(source, /finalReviewed:\s*false,\s*officialVerified:\s*false,\s*items:/);
});
