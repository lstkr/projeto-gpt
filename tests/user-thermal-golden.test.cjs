/**
 * Golden transcriptions of thermal receipts supplied on 2026-10-21.
 *
 * These tests validate the business parsers against reviewed text; they do NOT
 * measure camera/OCR recognition accuracy. Original identifiable JPEGs are
 * retained outside GitHub, in the owner's private Library.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const dataset=require('./fixtures/user-thermal-golden-20261021.json');
const cashParser=import('../lib/cash-report-parser.mjs');

const money=(input)=>Number(String(input).replace(/\./g,'').replace(',','.'));
const decimal=(input)=>money(input).toFixed(2);
const channelKeys={
  'CARTAO CREDITO':'cartaoCredito',
  'CARTAO DEBITO':'cartaoDebito',
  'CREDITO':'credito',
  'DEBITO':'debito',
  'DINHEIRO':'dinheiroVendas',
  'OUTRAS':'outras'
};
const toIso=(ptbr)=>ptbr.split('/').reverse().join('-');

test('photo registry preserves thirteen originals and fourteen independent documents',()=>{
  assert.equal(dataset.photos,13);
  assert.equal(dataset.documents,14);
  assert.equal(dataset.cash.length,7);
  assert.equal(dataset.fiscal.length,7);
  assert.equal(new Set([...dataset.cash,...dataset.fiscal].map(x=>x.photo)).size,13);
  const paired=dataset.fiscal.filter(x=>x.photo==='fiscal-03-duas-notas.jpeg');
  assert.equal(paired.length,2);
  assert.deepEqual(paired.map(x=>x.document_index),[0,1]);
  assert.notEqual(paired[0].expected.total,paired[1].expected.total);
});

for(const example of dataset.cash){
  test('cash photo '+example.case_id+' recognizes every sale and movement without digital duplication',async()=>{
    const {parseCashReport}=await cashParser;
    const actual=parseCashReport(example.transcribed_lines.join('\n'));
    assert.equal(actual.day,toIso(example.expected.day));
    assert.equal(actual.register,'003');
    assert.equal(actual.operator,'OPERADOR_ANONIMIZADO');
    for(const [label,amount] of Object.entries(example.expected.channels))
      assert.equal(actual[channelKeys[label]],decimal(amount),label);
    const declaredMoney=Object.values(example.expected.channels)
      .reduce((sum,s)=>sum+Math.round(money(s)*100),0);
    assert.equal(declaredMoney,Math.round(money(example.expected.total)*100),
      'printed sales channels must reconcile to printed total');
    assert.equal(actual.reportedTotal,money(example.expected.total));
    assert.equal(actual.reportedPos,money(example.expected.pos));
    const countedMovements=example.expected.movements.filter(m=>
      !/^SANGRIA\s*-\s*FECHAMENTO\s+DE\s+CAIXA\b/i.test(m.reason));
    assert.equal(actual.movements.length,countedMovements.length);
    for(let i=0;i<countedMovements.length;i++){
      assert.equal(actual.movements[i].type,countedMovements[i].type);
      assert.equal(actual.movements[i].amount,decimal(countedMovements[i].amount));
    }
    assert.ok(!actual.importWarnings.some(x=>x.includes('não confere')),
      'source should reconcile without a spurious sales mismatch');
    assert.equal(actual.requiresReview,true);
  });
}

test('cash-count discrepancy from photographed 2025-10-08 report remains a manual-review reference',()=>{
  const c=dataset.cash.find(x=>x.case_id==='08/10/2025').expected.physical;
  assert.equal(Math.round(money(c.operador)*100)-Math.round(money(c.sistema)*100),Math.round(money(c.diferenca)*100));
  assert.equal(money(c.diferenca),3.2);
});
test('cash report with S/N physical difference does not invent a numeric discrepancy',()=>{
  const c=dataset.cash.find(x=>x.case_id==='26/11/2025').expected.physical;
  assert.equal(c.diferenca,null);
});

// Exercise production fiscal rules like tests/receipt-conference.test.cjs.
const page=fs.readFileSync('pages/index.js','utf8');
const productMatching=fs.readFileSync('lib/duplicate-products.mjs','utf8')
  .replace(/^export /gm,'');
const start=page.indexOf('function localizedValue(raw)');
const end=page.indexOf('async function prepareReceiptCanvases',start);
assert.ok(start>=0 && end>start,'fiscal parser must remain extractable');
const extracted='const norm = (v) => String(v || "").trim().toLocaleLowerCase("pt-BR");\n'+
  productMatching+'\n'+page.slice(start,end)+
  '\n({parseReceiptOcr,reconcileReceiptTotals})';
const fiscalParser=vm.runInNewContext(extracted,{URL,console,TextDecoder});

for(const example of dataset.fiscal){
  test('fiscal photo '+example.case_id+' preserves quantity, units and printed totals',()=>{
    const text=example.transcribed_lines.join('\n');
    const items=fiscalParser.parseReceiptOcr(text);
    assert.equal(items.length,example.expected.products,
      'one fiscal document must not be split/duplicated by OCR');
    const totals=fiscalParser.reconcileReceiptTotals(text,text,items);
    assert.equal(totals.total,money(example.expected.total));
    if(example.expected.subtotal)
      assert.equal(totals.subtotal,money(example.expected.subtotal));
    if(example.expected.discount)
      assert.equal(totals.discount,money(example.expected.discount));
    if(example.expected.unit)
      assert.equal(items[0].unit,example.expected.unit);
    if(example.expected.quantity)
      assert.equal(items[0].quantity,example.expected.quantity);
    if(example.expected.manjericaoUnit)
      assert.equal(items[0].unit,example.expected.manjericaoUnit);
    if(example.expected.lastUnit)
      assert.equal(items.at(-1).unit,example.expected.lastUnit);
  });
}

test('contingency receipt keeps printed payable total separate from gross and discount',()=>{
 const example=dataset.fiscal.find(row=>row.case_id==='cupom-contingencia-seven-items');
 const text=example.transcribed_lines.join('\n');
 const items=fiscalParser.parseReceiptOcr(text);
 const totals=fiscalParser.reconcileReceiptTotals(text,text,items);
 assert.equal(items.length,7);
 assert.equal(totals.subtotal,829.79);
 assert.equal(totals.discount,87.94);
 assert.equal(totals.total,741.85);
 assert.match(totals.totalsWarning,/Soma das linhas diferente do subtotal fiscal/);
});

