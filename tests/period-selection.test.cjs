const {test}=require('node:test');
const assert=require('node:assert/strict');

test('lista inclui ano corrente e dez anteriores, sem anos futuros',async()=>{
 const {periodYears}=await import('../lib/period-selection.mjs');
 const years=periodYears(2026);assert.equal(years.length,11);assert.equal(years[0],'2026');assert.equal(years.at(-1),'2016');assert.ok(!years.includes('2027'));
});
test('roda altera somente seletor focado, respeita limites e remove listener',async()=>{
 const {listenForPeriodWheel}=await import('../lib/period-selection.mjs');
 let handler,changes=0,prevented=0;
 const container={addEventListener:(name,fn,options)=>{handler=fn;assert.equal(options.passive,false);},removeEventListener:(name,fn)=>assert.equal(handler,fn)};
 const select={tagName:'SELECT',selectedIndex:0,options:[{value:'01'},{value:'02'}],value:'01',ownerDocument:{},dispatchEvent:()=>changes++};
 const cleanup=listenForPeriodWheel(container);const event={target:select,deltaY:10,preventDefault:()=>prevented++};
 handler(event);assert.equal(changes,0);
 select.ownerDocument.activeElement=select;handler(event);assert.equal(select.value,'02');assert.equal(changes,1);
 select.selectedIndex=1;handler(event);assert.equal(changes,1);assert.equal(prevented,2);cleanup();
});
test('duplo clique abre lista nativa; indisponibilidade mantém campo utilizável',async()=>{
 const {openPeriodList}=await import('../lib/period-selection.mjs');let opened=0,focused=0;
 openPeriodList({showPicker:()=>opened++});assert.equal(opened,1);
 openPeriodList({showPicker:()=>{throw Error('Sem suporte');},focus:()=>focused++});assert.equal(focused,1);
});
