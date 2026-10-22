const { test } = require('node:test');
const assert = require('node:assert/strict');

const review = import('../lib/fiscal-line-review.mjs');

function allocator() {
  let value = 0;
  return () => 'line-unique-' + (++value);
}
function row(name, unitPrice = 10, lineId) {
  return { lineId, name, code: '000123', quantity: 1, unit: 'un',
    unitPrice, lineTotal: unitPrice, productId: '', stockDisposition: 'stock' };
}
const draft = (items, reviewedItems = {}, extra = {}) =>
  ({ items, reviewedItems, finalReviewed: false, totalsReviewed: false, ...extra });

test('each incoming receipt line gets a stable non-numeric ID', async () => {
  const { normalizeFiscalDraftReview } = await review;
  const f = allocator();
  const first = normalizeFiscalDraftReview(draft([row('Leite'), row('Leite')]), null, f);
  assert.notEqual(first.items[0].lineId, first.items[1].lineId);
  assert.ok(first.items.every(x => x.lineId.startsWith('line-')));
  const second = normalizeFiscalDraftReview({ ...first, checkedBy: 'Test' }, first, f);
  assert.deepEqual(second.items.map(x => x.lineId), first.items.map(x => x.lineId));
});

test('review never transfers after deletion, reorder, insert or replacement', async () => {
  const { normalizeFiscalDraftReview } = await review;
  const f = allocator();
  const base = normalizeFiscalDraftReview(draft([row('A'), row('B'), row('C')]), null, f);
  const [a, b, c] = base.items;
  const flagged = normalizeFiscalDraftReview(
    draft(base.items, { [b.lineId]: true }), base, f
  );
  assert.equal(flagged.reviewedItems[b.lineId], true);

  const deleted = normalizeFiscalDraftReview(
    draft([a, c], flagged.reviewedItems, { finalReviewed: true }), flagged, f
  );
  assert.equal(deleted.reviewedItems[b.lineId], undefined);
  assert.equal(deleted.reviewedItems[c.lineId], undefined);
  assert.equal(deleted.finalReviewed, false);

  const reordered = normalizeFiscalDraftReview(
    draft([c, b, a], flagged.reviewedItems, { finalReviewed: true }), flagged, f
  );
  assert.equal(reordered.reviewedItems[b.lineId], true);
  assert.equal(reordered.reviewedItems[c.lineId], undefined);

  const replaced = normalizeFiscalDraftReview(
    draft([a, row('New'), c], flagged.reviewedItems, { finalReviewed: true }), flagged, f
  );
  assert.equal(replaced.reviewedItems[b.lineId], undefined);
  assert.notEqual(replaced.items[1].lineId, b.lineId);
  assert.equal(replaced.finalReviewed, false);
});

test('editing code, unit, quantities, costs or associations invalidates review', async () => {
  const { normalizeFiscalDraftReview } = await review;
  const f = allocator();
  const initial = normalizeFiscalDraftReview(draft([row('Coffee')]), null, f);
  const id = initial.items[0].lineId;
  const flagged = normalizeFiscalDraftReview(draft(initial.items, { [id]: true }), initial, f);
  for (const change of [{code:'0000123'}, {unit:'kg'}, {quantity:2},
    {unitPrice:11}, {lineTotal:11}, {itemDiscount:1}, {productId:'catalog-a'},
    {stockQuantity:1.5}, {stockDisposition:'expense'}, {name:'Different'}]) {
    const changed = normalizeFiscalDraftReview(draft([{...flagged.items[0],...change}],
      flagged.reviewedItems, { finalReviewed: true, totalsReviewed: true }), flagged, f);
    assert.notEqual(changed.reviewedItems[id], true, JSON.stringify(change));
    assert.equal(changed.finalReviewed, false);
    assert.equal(changed.totalsReviewed, false);
  }
});

test('legacy index flags and duplicate line identifiers cannot unlock confirmation', async () => {
  const { normalizeFiscalDraftReview } = await review;
  const f = allocator();
  const result = normalizeFiscalDraftReview(draft([
    row('A',10,'same-id'), row('B',10,'same-id')
  ], { 0:true,1:true,'same-id':true }, { finalReviewed:true }), null, f);
  assert.notEqual(result.items[0].lineId,result.items[1].lineId);
  assert.equal(result.reviewedItems[result.items[0].lineId],undefined);
  assert.equal(result.reviewedItems[result.items[1].lineId],undefined);
  assert.equal(result.reviewedItems['0'],undefined);
  assert.equal(result.finalReviewed,false);
});

test('the rendered form uses lineId rather than array indexes as approval keys', () => {
  const fs = require('node:fs');
  const page = fs.readFileSync('pages/index.js','utf8');
  assert.match(page, /reviewedItems\?\.\[it\.lineId\]/);
  assert.match(page, /\[it\.lineId\]: e\.target\.checked/);
  assert.doesNotMatch(page, /checked=\{Boolean\(draft\.reviewedItems\?\.\[i\]\)\}/);
});

test('changing issuer invalidates every fiscal line approval', async () => {
  const {normalizeFiscalDraftReview} = await review;
  const f = allocator();
  const base = normalizeFiscalDraftReview({...draft([row('Egg')]),supplierCnpj:'11222333000181'},null,f);
  const id = base.items[0].lineId;
  const changed = normalizeFiscalDraftReview({...base,supplierCnpj:'',reviewedItems:{[id]:true},finalReviewed:true},base,f);
  assert.equal(changed.reviewedItems[id],undefined);
  assert.equal(changed.finalReviewed,false);
});

