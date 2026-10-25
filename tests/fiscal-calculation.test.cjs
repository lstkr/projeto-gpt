const { test } = require('node:test');
const assert = require('node:assert/strict');

let calculations;
test('fiscal line totals recalculate after quantity, price or unit edits', async () => {
  calculations = await import('../lib/fiscal-calculation.mjs');
  const original = { quantity: 2, unit: 'un', unitPrice: 5, lineTotal: 9.5 };
  const editedPrice = calculations.updateFiscalLine(original, 'unitPrice', '6.25');
  assert.equal(editedPrice.lineTotal, 12.5);
  assert.equal(editedPrice.reportedLineTotal, 9.5);
  assert.match(editedPrice.readingWarning, /Total lido na nota: 9\.50/);

  const editedQuantity = calculations.updateFiscalLine(editedPrice, 'quantity', '3');
  assert.equal(editedQuantity.lineTotal, 18.75);
  assert.equal(editedQuantity.reportedLineTotal, 9.5, 'preserve the first printed value across edits');

  const editedUnit = calculations.updateFiscalLine(editedQuantity, 'unit', 'kg');
  assert.equal(editedUnit.lineTotal, 18.75);
  assert.equal(editedUnit.manualLineCalculation, true);
});

test('line calculations round to cents and reject invalid arithmetic inputs', async () => {
  calculations ||= await import('../lib/fiscal-calculation.mjs');
  assert.equal(calculations.calculateFiscalLineTotal({ quantity: 3, unitPrice: 1.335 }), 4.01);
  assert.equal(calculations.calculateFiscalLineTotal({ quantity: -1, unitPrice: 10 }), 0);
  assert.equal(calculations.calculateFiscalLineTotal({ quantity: 2, unitPrice: Infinity }), 0);
});

test('subtotal follows line totals after item edits while retaining manual subtotal overrides', async () => {
  calculations ||= await import('../lib/fiscal-calculation.mjs');
  const draft = { subtotal: 30, lineTotalsEdited: true, manualInvoice: false };
  assert.equal(calculations.resolveFiscalSubtotal(draft, 34.5), 34.5);
  assert.equal(calculations.resolveFiscalSubtotal({ ...draft, subtotalManuallyEdited: true }, 34.5), 30);
  assert.equal(calculations.resolveFiscalSubtotal({ ...draft, manualInvoice: true }, 34.5), 34.5);
});
