const {test}=require('node:test');
const assert=require('node:assert/strict');
const lines=[{text:'DADOS DO PRODUTO / SERVIÇO',bbox:{y0:300}},{text:'DADOS ADICIONAIS',bbox:{y0:900}}];

test('recortes usam títulos reconhecidos, não terços fixos da foto',async()=>{
 const {danfeRegions}=await import('../lib/danfe-regions.mjs');
 assert.deepEqual(danfeRegions({width:1000,height:1400,lines}),{header:{left:0,top:0,width:1000,height:300},products:{left:0,top:288,width:1000,height:612}});
 assert.equal(danfeRegions({width:0,height:1400,lines}),null);
 assert.equal(danfeRegions({width:1000,height:1400,lines:[]}),null);
 assert.equal(danfeRegions({width:1000,height:1400,lines:[...lines,lines[0]]}),null);
 assert.equal(danfeRegions({width:1000,height:1400,lines:[{...lines[0],bbox:{y0:1399}}]}),null);
});

test('três leituras usam o mesmo worker, recortes explícitos e encerramento',async()=>{
 const {readDanfeByRegions}=await import('../lib/danfe-regional-reader.mjs');
 let terminated=0;const calls=[];
 const outputs=[{blocks:[{paragraphs:[{lines}]}]},{text:'EMITENTE SINTETICO'},{text:'00042 PRODUTO SINTETICO'}];
 const worker={setParameters:async()=>{},recognize:async(canvas,options)=>{calls.push(options);return {data:outputs.shift()};},terminate:async()=>terminated++};
 const result=await readDanfeByRegions('blob:synthetic',{createWorker:async()=>worker,makeCanvas:async()=>({width:1000,height:1400})});
 assert.equal(calls.length,3);assert.equal(calls[1].rectangle.height,300);assert.equal(calls[2].rectangle.top,288);
 assert.match(result.text,/EMITENTE SINTETICO\nDADOS DO PRODUTO \/ SERVICO\n00042/);assert.equal(terminated,1);
});

test('sem tabela única não há leitura de produtos nem substituição silenciosa',async()=>{
 const {readDanfeByRegions}=await import('../lib/danfe-regional-reader.mjs');let calls=0,terminated=0;
 const worker={setParameters:async()=>{},recognize:async()=>{calls++;return {data:{blocks:[]}};},terminate:async()=>terminated++};
 await assert.rejects(readDanfeByRegions('blob:synthetic',{createWorker:async()=>worker,makeCanvas:async()=>({width:1000,height:1400})}),/delimitar uma única tabela/);
 assert.equal(calls,1);assert.equal(terminated,1);
});

test('cancelamento encerra worker sem esperar reconhecimento travado',async()=>{
 const {readDanfeByRegions}=await import('../lib/danfe-regional-reader.mjs');const controller=new AbortController();let terminated=0;
 const worker={setParameters:async()=>{},recognize:()=>new Promise(()=>{}),terminate:async()=>terminated++};
 const task=readDanfeByRegions('blob:synthetic',{signal:controller.signal,createWorker:async()=>worker,makeCanvas:async()=>({width:1000,height:1400})});
 await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(task,/cancelada/);assert.equal(terminated,1);
});

test('worker inicializado após cancelamento também é encerrado',async()=>{
 const {readDanfeByRegions}=await import('../lib/danfe-regional-reader.mjs');const controller=new AbortController();let finish,terminated=0;
 const task=readDanfeByRegions('blob:synthetic',{signal:controller.signal,createWorker:()=>new Promise(resolve=>{finish=resolve;}),makeCanvas:async()=>({width:1000,height:1400})});
 await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(task,/cancelada/);
 finish({terminate:async()=>terminated++});await new Promise(resolve=>setImmediate(resolve));assert.equal(terminated,1);
});
