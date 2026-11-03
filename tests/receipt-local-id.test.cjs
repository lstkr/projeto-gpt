const test=require('node:test');const assert=require('node:assert/strict');
test('arquivar e renomear preserva identidade e confirmação; outra nota recebe identidade nova',async()=>{
 const {withLocalReceiptId}=await import('../lib/receipt-reviewer.mjs');
 assert.equal(withLocalReceiptId({},null,()=> 'inicial').localReceiptId,'inicial');
 const first=withLocalReceiptId({items:[]},null,()=> 'nota-1');
 const checked={...first,finalReviewed:true,checkedBy:'Equipe'};
 const saved=withLocalReceiptId({...checked,pendingId:'servidor',fileName:'novo.xml'},checked,()=> 'incorreto');
 assert.equal(saved.localReceiptId,first.localReceiptId);assert.equal(saved.finalReviewed,true);assert.equal(saved.checkedBy,'Equipe');
 assert.equal(withLocalReceiptId({items:[]},checked,()=> 'nota-2').localReceiptId,'nota-2');
 const source=require('node:fs').readFileSync('pages/index.js','utf8');
 assert.ok(source.includes('reviewerName, draft?.localReceiptId]'));
});
