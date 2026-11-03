const test=require('node:test');
const assert=require('node:assert/strict');

test('ano agrupa rubricas por mês, sem sangria nem dados presumidos',async()=>{
  const {revenueChart}=await import('../lib/revenue-chart.mjs');
  const result=revenueChart([{day:'2026-11-01',dinheiroVendas:'0.10',outras:'0.20',movements:[{amount:99}]},
    {day:'2026-11-02',dinheiroVendas:'1.00'},{day:'2026-10-01',credito:'2.00'}],{month:'2026-11',scope:'year'});
  assert.equal(result.points.length,12);assert.equal(result.points[10].cents,130n);
  assert.equal(result.points[9].cents,200n);assert.equal(result.points[0].recorded,false);
  assert.equal(result.max.key,'2026-10');assert.equal(result.min.key,'2026-11');
  assert.equal(result.lastKey,'2026-11');assert.ok(result.ceiling>=200n);
});

test('mês inclui todos os dias, diferencia zero registrado e exclui rubrica inválida',async()=>{
  const {revenueChart}=await import('../lib/revenue-chart.mjs');
  const result=revenueChart([{day:'2024-02-02',dinheiroVendas:'0'},
    {day:'2024-02-29',dinheiroVendas:'12.34'},{day:'2024-02-03',outras:null}],{month:'2024-02',scope:'month'});
  assert.equal(result.points.length,29);assert.equal(result.points[1].recorded,true);
  assert.equal(result.points[0].recorded,false);assert.equal(result.min.cents,0n);
  assert.equal(result.max.cents,1234n);assert.equal(result.lastKey,'2024-02-29');assert.equal(result.invalid,1);
  assert.equal(revenueChart([],{month:'',scope:'month'}).points.length,0);
});

test('histórico do caixa filtra mês ou ano sem alterar os registros',async()=>{
  const {historyPeriod}=await import('../lib/history-view.mjs');
  const entries=[{day:'2026-11-01'},{day:'2026-10-01'},{day:'2025-11-01'},{day:'inválida'}];
  assert.deepEqual(historyPeriod(entries,'2026-11','month'),[entries[0]]);
  assert.deepEqual(historyPeriod(entries,'2026-11','year'),entries.slice(0,2));
  assert.equal(historyPeriod(entries,'','month').length,0);assert.equal(entries.length,4);
});

test('documentos mostram só um dia e preservam o acesso ao legado sem data',async()=>{
  const {documentHistory,historyDay}=await import('../lib/history-view.mjs');
  const documents=[{date:'2026-11-01'},{date:'02/11/2026'},{date:'2026-10-03'},
    {importedAt:'2026-11-02T22:00:00Z'},{date:'inválida'}];
  const current=documentHistory(documents,'2026-11','');
  assert.deepEqual(current.days,['2026-11-02','2026-11-01']);assert.equal(current.documents.length,2);
  assert.deepEqual(documentHistory(documents,'2026-11','2026-11-01').documents,[documents[0]]);
  assert.deepEqual(documentHistory(documents,'2026-12','unknown').documents,[documents[3],documents[4]]);
  assert.equal(current.unknown,2,'data de importação nunca substitui emissão no filtro');
  assert.equal(historyDay('31/02/2026'),'');assert.equal(documents.length,5);
});
