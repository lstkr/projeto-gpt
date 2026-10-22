const test=require('node:test');
const assert=require('node:assert/strict');
const mod=import('../lib/count-print-view.mjs');
const products=[{id:'p-1',name:'Leite',sku:'000123',unit:'L',category:'Frios',
  stock:10.25,cost:999999,unitPrice:99998,valuation:1234}];
const last={id:'c-1',items:[{productId:'p-1',name:'Leite',expected:10.25,counted:9.75,cost:555555}]};
const user={role:'admin',display_name:'Gestor teste'};

test('blind printable sheet excludes stock, costs and checked quantities even for manager',async()=>{
 const {buildCountSheet}=await mod;
 const sheet=buildCountSheet({products,latestCount:last,user});
 const text=JSON.stringify(sheet);
 assert.equal(sheet.mode,'blind');
 assert.match(text,/000123/);
 assert.doesNotMatch(text,/999999|99998|1234|555555|10.25|9.75/);
 assert.equal(sheet.items[0].name,'Leite');
 assert.equal(sheet.reference,'Folha auxiliar');
});
test('only manager can create finalized count difference report',async()=>{
 const {buildCountSheet}=await mod;
 const sheet=buildCountSheet({products,latestCount:last,user,mode:'differences',paper:'thermal58'});
 assert.equal(sheet.items[0].expected,10.25);
 assert.equal(sheet.items[0].counted,9.75);
 assert.equal(sheet.items[0].unit,'L');
 assert.doesNotMatch(JSON.stringify(sheet),/555555|999999|99998/);
 assert.throws(()=>buildCountSheet({products,latestCount:last,user:{role:'employee'},mode:'differences'}),/gestor/);
 assert.throws(()=>buildCountSheet({products,user,mode:'differences'}),/conferência concluída/);
});
test('historical quantity absence stays unknown; never becomes zero',async()=>{
 const {buildCountSheet}=await mod;
 const sheet=buildCountSheet({products,latestCount:{id:'x',items:[{productId:'p-1',name:'Leite',expected:null,counted:''}]},user,mode:'differences'});
 assert.equal(sheet.items[0].expected,null);
 assert.equal(sheet.items[0].counted,null);
});
test('reject unexpected formats, modes and unsafe catalog input',async()=>{
 const {buildCountSheet}=await mod;
 assert.throws(()=>buildCountSheet({products,paper:'evil'}),RangeError);
 assert.throws(()=>buildCountSheet({products,mode:'write'}),RangeError);
 assert.throws(()=>buildCountSheet({products:{invalid:true}}),TypeError);
});
