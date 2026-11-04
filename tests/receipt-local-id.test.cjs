const test=require('node:test');const assert=require('node:assert/strict');
test('arquivar e renomear preserva identidade e confirmação; outra nota recebe identidade nova',async()=>{
 const {withLocalReceiptId}=await import('../lib/receipt-reviewer.mjs');
 assert.equal(withLocalReceiptId({},()=> 'inicial').localReceiptId,'inicial');
 const first=withLocalReceiptId({items:[]},()=> 'nota-1');
 const checked={...first,finalReviewed:true,checkedBy:'Equipe'};
 const saved=withLocalReceiptId({...checked,pendingId:'servidor',fileName:'novo.xml'},()=> 'incorreto');
 assert.equal(saved.localReceiptId,first.localReceiptId);assert.equal(saved.finalReviewed,true);assert.equal(saved.checkedBy,'Equipe');
 assert.equal(withLocalReceiptId({items:[]},()=> 'nota-2').localReceiptId,'nota-2');
});
