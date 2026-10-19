const test=require('node:test');
const assert=require('node:assert/strict');
const utils=import('../lib/cash-closing.mjs');
test('fechamento do PDF: faturamento 569 não inclui movimentações',async()=>{
 const {cashTotals}=await utils;
 const totals=cashTotals({
   cartaoCredito:130,cartaoDebito:21,credito:181,debito:72,outras:165,
   movements:[{type:'suprimento',amount:238.50,reason:'Abertura'},
     {type:'suprimento',amount:3,reason:'Troco'},
     {type:'sangria',amount:241.5,reason:'Fechamento'}]});
 assert.equal(totals.revenue,569);
 assert.equal(totals.pos,151);
 assert.equal(totals.inflow,241.5);
 assert.equal(totals.outflow,241.5);
 assert.equal(totals.cashExpected,0);
});
test('dinheiro de vendas afeta faturamento mas suprimento nao',async()=>{
 const {cashTotals}=await utils;
 const result=cashTotals({dinheiroVendas:100,movements:[{type:'suprimento',amount:20},{type:'sangria',amount:15}]});
 assert.equal(result.revenue,100);assert.equal(result.cashExpected,105);
});
test('agrupa fechamentos diários do mesmo mês e vários caixas',async()=>{
 const {aggregateCashMonthly}=await utils;
 const docs=[{day:'2026-10-10',cartaoCredito:130,outras:439},
 {day:'2026-10-10',debito:100},{day:'2026-10-12',credito:50},
 {day:'2026-09-29',credito:200}];
 const m=aggregateCashMonthly(docs,2026,10);
 assert.equal(m.count,3);assert.equal(m.revenue,719);
 assert.deepEqual(m.daily.map(d=>d.revenue),[669,50]);
});
test('rejeita movimentações sem motivo e valores inválidos',async()=>{
 const {validateCashClosing}=await utils;
 const base={day:'2026-10-10',register:'003',operator:'ADMIN',cartaoCredito:100};
 assert.deepEqual(validateCashClosing({...base,movements:[{type:'sangria',amount:20,reason:''}]}).length,1);
 assert.ok(validateCashClosing({...base,cartaoCredito:-1,movements:[]}).length);
 assert.ok(validateCashClosing({...base,movements:[{type:'sangria',amount:20,reason:'Retirada'}]}).length);
});
