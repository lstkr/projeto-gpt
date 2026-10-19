const test = require('node:test');
const assert = require('node:assert/strict');

const item = { code: '000123', name: 'Café', quantity: 2, unitPrice: 10, lineTotal: 20 };
const totals = { totalsSource: 'OCR (leitura principal)', totalsWarning: '', hasPrintedTotal: true };

test('OCR strategy: sound coded receipt with printed matching totals uses one pass', async () => {
  const { needsSecondOcrPass } = await import('../lib/receipt-ocr-strategy.mjs');
  assert.equal(needsSecondOcrPass([item], totals, 89), false);
});
test('OCR strategy: missing code, missing total, low confidence or mismatches require a second pass', async () => {
  const { needsSecondOcrPass } = await import('../lib/receipt-ocr-strategy.mjs');
  for (const candidate of [
    [], [{ ...item, code: '' }], [{ ...item, unitInferred: true }],
    [{ ...item, readingWarning: 'Confira' }], [{ ...item, lineTotal: 12 }]
  ]) assert.equal(needsSecondOcrPass(candidate, totals, 90), true);
  assert.equal(needsSecondOcrPass([item], { ...totals, hasPrintedTotal: false }, 90), true);
  assert.equal(needsSecondOcrPass([item], { ...totals, totalsWarning: 'Diferença fiscal' }, 90), true);
  assert.equal(needsSecondOcrPass([item], totals, 60), true);
  assert.equal(needsSecondOcrPass([item], totals, undefined), true);
});
