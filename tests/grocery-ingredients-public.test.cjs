const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('pages/index.js','utf8');
const start = code.indexOf('function localizedValue(raw)');
const end = code.indexOf('async function prepareReceiptCanvases',start);
assert.ok(start>=0 && end>start);
const rules = vm.runInNewContext('const norm=v=>String(v||"").trim().toLowerCase();\n'+code.slice(start,end)+'\n({parseReceiptOcr,mergeReceiptCandidates,compareInvoiceItems,normalizeReceiptUnit})');

// Actual publicly documented items: MERCADINHO LA PALMA NF-e 23103,
// Sep 24, 2019, published by Câmara dos Deputados.
// Source: https://www.camara.leg.br/cota-parlamentar/nota-fiscal-eletronica?ideDocumentoFiscal=6928406
// Only seven item rows are transcribed here; do not assume their subtotal
// equals the full invoice total (R$349.07). No personal identifiers included.
const products = [
 ['0000299','MELANCIA KG',4.7200,'KG',2.00,9.44],
 ['0000329','ABACAXI PEROLA UN',2.0000,'UN',6.60,13.20],
 ['0000256','MACA FUJI KG',1.8650,'KG',12.50,23.31],
 ['0000302','AMEIXA IMPORTADA KG',1.0250,'KG',19.60,20.09],
 ['0000760','BANANA PRATA KG',2.7850,'KG',4.90,13.64],
 ['0104612','CAFE DESCAFEINADO MELITTA 250 GR.',1,'PCT',14.80,14.80],
 ['0157660','MANTEIGA ITAMBE 1. QUALIDADE 200G COM SAL',2,'PT',11.50,23.00]
];
const num=(value,places)=>Number(value).toFixed(places).replace('.',',');
test('Seven verified real grocery items: ingredients, weight, pot vs pack, printed totals',()=>{
 const source=['CODIGO DESCRICAO',...products.flatMap(([code,name,q,u,p,t])=>[
  code+' '+name,num(q,4)+' '+u+' '+num(p,4)+' '+num(t,2)
 ])].join('\n');
 const items=rules.parseReceiptOcr(source);
 assert.equal(items.length,products.length);
 items.forEach((it,index)=>{
  const [code,name,quantity,unit,unitPrice,total]=products[index];
  assert.equal(it.code,code);assert.equal(it.name,name.replace(/[.\\s]+$/,''));
  assert.equal(it.quantity,quantity);
  assert.equal(it.unit,unit.toLowerCase());
  assert.equal(it.unitPrice,unitPrice);assert.equal(it.lineTotal,total);
 });
 assert.equal(rules.mergeReceiptCandidates(items,items).length,products.length);
 assert.equal(rules.compareInvoiceItems(items,items).every(x=>x.status==='Confere'),true);
});
test('Pote (PT) must not be treated as unit (UN) or pacote (PCT)',()=>{
 assert.equal(rules.normalizeReceiptUnit('PT'),'pt');
 assert.notEqual(rules.normalizeReceiptUnit('PT'),rules.normalizeReceiptUnit('PCT'));
 assert.notEqual(rules.normalizeReceiptUnit('PT'),rules.normalizeReceiptUnit('UN'));
});
