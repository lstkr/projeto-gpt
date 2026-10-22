const test = require('node:test');
const assert = require('node:assert/strict');

test('purchase print uses replenishment, category subtotals and partial price warning', async () => {
  const { purchasePlan } = await import('../lib/purchasing.mjs');
  const { purchasePrintHtml } = await import('../lib/purchase-print.mjs');
  const plan = purchasePlan([
    { id: '1', name: 'Leite', sku: '00012', category: 'Frios', unit: 'L', stock: 2, min: 5, cost: 4 },
    { id: '2', name: 'Café', category: 'Secos', unit: 'kg', stock: 0, min: 1 },
    { id: '3', name: 'Não comprar', stock: 10, min: 2 }
  ], []);
  const html = purchasePrintHtml(plan, new Date('2026-10-21T12:00:00Z'));
  assert.match(html, /Lista de compras/);
  assert.match(html, /00012/);
  assert.match(html, /3 L/);
  assert.match(html, /Subtotal/);
  assert.match(html, /Total estimado \(parcial\)/);
  assert.match(html, /1 produto\(s\) sem preço/);
  assert.doesNotMatch(html, /Não comprar|Contagem de estoque/);
});

test('purchase print escapes untrusted catalog values instead of executing markup', async () => {
  const { purchasePrintHtml } = await import('../lib/purchase-print.mjs');
  const dangerous = '<img src=x onerror="alert(1)">';
  const html = purchasePrintHtml({ total: 0, categories: [{ name: dangerous, subtotal: 0, items: [{ name: dangerous, sku: dangerous, usualSupplier: dangerous, unit: dangerous, priceSource: dangerous }] }] });
  assert.doesNotMatch(html, /<img|<script/i);
  assert.match(html, /&lt;img/);
});
