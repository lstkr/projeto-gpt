const test=require('node:test');
const assert=require('node:assert/strict');

test('mês em andamento é parcial e não disputa menor mês registrado',async()=>{
  const {revenueChart}=await import('../lib/revenue-chart.mjs');
  const result=revenueChart([{day:'2026-10-01',credito:'500'},{day:'2026-11-01',credito:'10'}],
    {month:'2026-11',scope:'year',today:'2026-11-03'});
  assert.equal(result.points[10].partial,true);assert.equal(result.min.key,'2026-10');
  assert.equal(revenueChart([{day:'2026-11-01',credito:'10'}],{month:'2026-11',scope:'year',today:'2026-11-03'}).min,null);
});
test('todos os dias é padrão; dia explícito e sem data continuam acessíveis',async()=>{
  const {documentHistory}=await import('../lib/history-view.mjs');
  const documents=[{date:'2026-11-01'},{date:'2026-11-02'},{date:''},{date:'2026-10-01'}];
  assert.equal(documentHistory(documents,'2026-11','').documents.length,2);
  assert.equal(documentHistory(documents,'2026-11','2026-11-01').documents.length,1);
  assert.equal(documentHistory(documents,'2026-11','unknown').documents.length,1);
});
test('relatório detecta overflow interno mesmo quando documento não transborda',()=>{
  const {overflowReport}=require('../scripts/preview/overflow-report.cjs');
  const report=overflowReport([{file:'nota_768.jpg',scrollWidth:768,innerWidth:768,
    containers:[{className:'table-wrap',scrollWidth:1036,clientWidth:606}],consoleErrors:[]}]);
  assert.match(report,/1036 > clientWidth 606/);assert.doesNotMatch(report,/Nenhum/);
});
