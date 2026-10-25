const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('pages/index.js', 'utf8');

test('legacy inventory display fields cannot discard the authenticated reviewer ID', () => {
  const identity = {id:'authenticated-id',role:'admin',display_name:'Gestor'};
  const state = {user:{display_name:'Old name',role:'admin'}};
  const assignment = source.match(/setCurrentUser\(\{ \.\.\.\(state.user \|\| \{\}\), \.\.\.identity \}\);/);
  assert.ok(assignment);
  let actual;
  vm.runInNewContext(assignment[0], {identity,state,setCurrentUser:value=>{actual=value;}});
  assert.equal(actual.id,identity.id);
  assert.equal(actual.display_name,'Gestor');
});

test('cash correction closes the modal before opening the editable form', () => {
  const edit = source.slice(source.indexOf('function editCashClosing(entry)'),source.indexOf('async function openCashClosingDetail'));
  assert.ok(edit.indexOf("setCashSelectedDay('')") < edit.indexOf("setCashEntryMode('edit')"));
  assert.match(edit,/expectedUpdatedAt:entry.updatedAt/);
  const save = source.slice(source.indexOf('async function saveCashClosing('),source.indexOf('function openManualEntry('));
  assert.match(save,/p_reason:correction\.reason/);
  assert.match(save,/reason.length<5||reason.length>300/);
  assert.match(save,/!cashCorrectionConfirmed/);
  assert.match(edit,/cashReviewed:false/);
});

test('80mm count sheet reduces side margins and keeps its content inside the page', async () => {
  const {countPrintHtml} = await import('../lib/count-print.mjs');
  const html=countPrintHtml({paper:'thermal80',items:[]});
  assert.match(html,/size:80mm 297mm;margin:2mm/);
  assert.match(html,/width:76mm/);
});

test('official metadata reads separated summary blocks and issuer, without using payment values', async () => {
  const {parseNfceMetadata} = await import('../lib/server/nfce-metadata.mjs');
  const html='<div id="u20">COMERCIO DE TESTE LTDA</div>';
  const text='COMERCIO DE TESTE LTDA\nCNPJ: 11.222.333/0001-81\nValor total R$\n149,04\nDesconto R$\n10,00\nValor a pagar R$\n139,04\nDinheiro\n120,00\nPIX\n19,04';
  const result=parseNfceMetadata(html,text);
  assert.equal(result.supplier.name,'COMERCIO DE TESTE LTDA');
  assert.equal(result.supplier.cnpj,'11222333000181');
  assert.deepEqual(result.totals,{subtotal:149.04,discount:10,total:139.04});
  assert.equal(parseNfceMetadata('', 'Valor total R$\nDinheiro 999,00').totals.total,null);
  assert.throws(()=>parseNfceMetadata(html,text,'43261000000000000000650010000000011000000000'),/emitente/);
});

test('flattened five-item OCR keeps package quantities out of the fiscal amount', () => {
  const matching=fs.readFileSync('lib/duplicate-products.mjs','utf8').replace(/^export /gm,'');
  const code='const norm=v=>String(v||"").trim().toLocaleLowerCase("pt-BR");\n'+matching+'\n'+source.slice(source.indexOf('function localizedValue(raw)'),source.indexOf('async function prepareReceiptCanvases'))+'\n({parseReceiptOcr,parseReceiptTotals})';
  const rules=vm.runInNewContext(code,{URL,console,TextDecoder});
  // Anonymous transcription of the reported OCR errors; no original fiscal IDs.
  const text='CODIGO — DESCRIÇÃO QTDE UN VL UNIT VL TOTAL 465 COENTRO 1,0000 ML 4/0000 4,00 682 TOMATE CEREJA 1,0000 KG 19,4800 19. 836 TOMATE 1,0000 KG 11,5600 11,56 980 ALECRIM 1,0000 UN 4,0000 4,00 1629 OVOS BRANCO 6 X 30 UN 1,0000 CX 100,0000 100,00 QTD TOTAL DE ITENS 5 VALOR TOTAL R$ 139,04';
  const items=rules.parseReceiptOcr(text);
  assert.equal(items.length,5);
  assert.deepEqual(Array.from(items,x=>x.code),['465','682','836','980','1629']);
  assert.equal(items[0].unitPrice,4);
  assert.equal(items[0].unit,'ml');
  assert.equal(items[1].lineTotal,19.48);
  assert.ok(items[1].readingWarning);
  assert.equal(items[4].quantity,1);
  assert.equal(items[4].unit,'cx');
  assert.equal(items.reduce((sum,x)=>sum+x.lineTotal,0),139.04);
  const packed=rules.parseReceiptOcr('CODIGO DESCRIÇÃO QTDE UN VL UNIT VL TOTAL 001 COPO 1000 ML 1,0000 UN 4,0000 4,00 002 TAMPA 1,0000 UN 2,0000 2,00 QTD TOTAL DE ITENS 2 VALOR TOTAL R$ 6,00');
  assert.equal(packed.length,2);
  assert.equal(packed[0].name,'COPO 1000 ML');
});


test('chart uses the history detail for one closing, preserving multi-register days', async () => {
  const start=source.indexOf('function openCashDay(day)');
  const end=source.indexOf('async function openCashClosingDetail(entry)',start);
  const code=source.slice(start,end)+';openCashDay("2026-10-22");';
  for(const count of [1,2]) {
    let opened=null,selected=null,closing=null;
    const closings=Array.from({length:count},(_,id)=>({id,day:'2026-10-22'}));
    vm.runInNewContext(code,{closings,openCashClosingDetail:entry=>{opened=entry.id;},setCashSelectedDay:day=>{selected=day;},setCashSelectedClosingId:id=>{closing=id;},setCashAuditHistory:()=>{}});
    if(count===1)assert.equal(opened,0);
    else {assert.equal(opened,null);assert.equal(selected,'2026-10-22');assert.equal(closing,'');}
  }
});
