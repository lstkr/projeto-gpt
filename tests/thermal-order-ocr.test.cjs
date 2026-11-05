const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const text='PEDIDO No:000042 Data:04/11/2026\nSEM VALOR FISCAL\nCODIGO LOTE UN QUAN. V.UNIT TOTAL\nDESCRICAO\nBANDEJA SINTETICA 120 X 160\n500 ML C/10 UN.\n00017 2,50 4,00 10,00\nSUB-TOTAL 10,00\nDINHEIRO 10,00';

test('pedido preserva descrição anterior completa e código com zeros sem usar embalagem como unidade',async()=>{
 const {parseThermalOrder}=await import('../lib/thermal-order-ocr.mjs');const [item]=parseThermalOrder(text);
 assert.equal(item.code,'00017');assert.equal(item.name,'BANDEJA SINTETICA 120 X 160 500 ML C/10 UN.');
 assert.equal(item.quantity,2.5);assert.equal(item.unitPrice,4);assert.equal(item.lineTotal,10);assert.equal(item.unit,'');assert.equal(item.unitInferred,true);
 assert.match(item.readingWarning,/Unidade de venda ausente/);assert.equal(parseThermalOrder(text).length,1);
});

test('pedido não se confunde com documento fiscal nem mistura duas notas',async()=>{
 const {parseThermalOrder}=await import('../lib/thermal-order-ocr.mjs');
 assert.equal(parseThermalOrder(text.replace('SEM VALOR FISCAL','NFC-e')),null);
 assert.equal(parseThermalOrder('DANFE\n'+text),null);assert.deepEqual(parseThermalOrder(text+'\n'+text),[]);
 assert.deepEqual(parseThermalOrder(text.replace('2,50 4,00 10,00','2,50 -4,00 -10,00')),[]);
});

test('total divergente exige conferência e quantidade não é corrigida automaticamente',async()=>{
 const {parseThermalOrder}=await import('../lib/thermal-order-ocr.mjs');const [item]=parseThermalOrder(text.replace('2,50 4,00','2,00 4,00'));
 assert.equal(item.quantity,2);assert.equal(item.lineTotal,10);assert.match(item.readingWarning,/divergem/);
});

test('Pedido Número não vira nNF e preserva referência comercial como texto',()=>{
 const page=readFileSync('pages/index.js','utf8');const source=page.match(/^function detectReceiptMetadata\(text\) \{[\s\S]*?^\}/m)[0];
 const read=vm.runInNewContext('('+source+')');
 for(const label of ['PEDIDO No:','PEDIDO Número:']){
  const result=read('SEM VALOR FISCAL\n'+label+'000042\n04/11/2026');
  assert.equal(result.orderNumber,'000042');assert.equal(result.invoiceNumber,'');assert.equal(result.date,'04/11/2026');
 }
});
