const test=require('node:test');
const assert=require('node:assert/strict');
const calculator=import('../lib/cmv-calculator.mjs');

test('CMV uses historical cent values, not floating prices',async()=>{
  const {calculateCmv}=await calculator;
  const r=calculateCmv({openingStockCents:100000,netPurchasesCents:50000,
    closingStockCents:80000,revenueCents:200000});
  assert.equal(r.status,'calculated');
  assert.equal(r.cmvCents,70000);
  assert.equal(r.cmvPercent,35);
  assert.deepEqual(r.missing,[]);
});
test('missing historical snapshots must never become zero',async()=>{
  const {calculateCmv}=await calculator;
  const x=calculateCmv({openingStockCents:0,netPurchasesCents:5000});
  assert.equal(x.status,'insufficient-data');
  assert.equal(x.cmvCents,null);
  assert.equal(x.cmvPercent,null);
  assert.deepEqual(x.missing,['closingStockCents']);
});
test('unknown revenue or zero revenue does not invent a CMV percentage',async()=>{
  const {calculateCmv}=await calculator;
  const base={openingStockCents:10000,netPurchasesCents:5000,closingStockCents:8000};
  for(const revenueCents of [undefined,0]){
    const r=calculateCmv({...base,revenueCents});
    assert.equal(r.cmvCents,7000);
    assert.equal(r.cmvPercent,null);
    assert.equal(r.status,'cmv-only');
    assert.ok(r.warnings.length);
  }
});
test('returns/refunds may make purchases net negative, producing explicit review',async()=>{
  const {calculateCmv}=await calculator;
  const r=calculateCmv({openingStockCents:100,netPurchasesCents:-500,
    closingStockCents:100,revenueCents:300});
  assert.equal(r.cmvCents,-500);
  assert.equal(r.cmvPercent,null);
  assert.equal(r.status,'needs-review');
});
test('basis points round half-up without floating point loss',async()=>{
  const {calculateCmv}=await calculator;
  const r=calculateCmv({openingStockCents:3333,netPurchasesCents:0,
    closingStockCents:0,revenueCents:10000});
  assert.equal(r.cmvPercent,33.33);
  const small=calculateCmv({openingStockCents:1,netPurchasesCents:0,
    closingStockCents:0,revenueCents:80000});
  assert.equal(small.cmvPercent,0);
});
test('reject fractional/invalid/unsafe cents instead of silently truncating',async()=>{
  const {calculateCmv}=await calculator;
  const base={openingStockCents:100,netPurchasesCents:50,closingStockCents:80,revenueCents:200};
  for(const value of [-1,1.5,'100',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>calculateCmv({...base,openingStockCents:value}),RangeError);
  }
  assert.throws(()=>calculateCmv({...base,revenueCents:-10}),RangeError);
  assert.throws(()=>calculateCmv({...base,netPurchasesCents:1.1}),RangeError);
  assert.throws(()=>calculateCmv({...base,openingStockCents:Number.MAX_SAFE_INTEGER,netPurchasesCents:500}),RangeError);
  assert.throws(()=>calculateCmv(null),TypeError);
});
