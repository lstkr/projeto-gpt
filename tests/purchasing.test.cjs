const test=require('node:test');
const assert=require('node:assert/strict');
const api=import('../lib/purchasing.mjs');
const p=(id,name,sku,category='Mercearia',unit='kg',stock=0,min=5,cost=12)=>({id,name,sku,category,unit,stock,min,cost});
const document=(supplier,supplierCnpj,items,stockEntries,total=75)=>({supplier,supplierCnpj,items,stockEntries,total,invoiceNumber:'001'});

test('nota antiga do mesmo fornecedor e nome vincula produto sem criar cadastro',async()=>{
 const {attachPreviousPurchases,findHistoricalMatches}=await api;
 const catalog=[p('a','Tomate italiano','00412','Hortifruti')];
 const previous=[document('Horti Pelotas','12345678000190',[{name:'TOMATE ITALIANO',code:'00412',unit:'kg',quantity:1,productId:'a'}],
   [{productId:'a',quantity:1,netUnitCost:10}])];
 const draft={supplier:'Horti Pelotas',supplierCnpj:'12345678000190',items:[{name:'Tomate italiano',code:'412',unit:'kg',quantity:3}]};
 assert.equal(findHistoricalMatches(draft,previous,catalog)[0].confident,true);
 const hydrated=attachPreviousPurchases(draft,previous,catalog);
 assert.equal(hydrated.items[0].productId,'a');
 assert.equal(draft.items[0].productId,undefined);
});

test('fornecedores com CNPJ diferente nao cruzam notas',async()=>{
 const {findHistoricalMatches}=await api;
 const docs=[document('Distribuidora','12345678000190',[{name:'LEITE INTEGRAL',code:'123',unit:'l'}],[])];
 const note={supplier:'Distribuidora',supplierCnpj:'99999999000199',items:[{name:'LEITE INTEGRAL',code:'00123',unit:'l'}]};
 assert.deepEqual(findHistoricalMatches(note,docs,[]),[null]);
});

test('OCR com mesmo codigo mas nome ilegivel exige revisao',async()=>{
 const {attachPreviousPurchases,findHistoricalMatches}=await api;
 const items=[{name:'XYZ XXX OCR',code:'00123',unit:'kg'}];
 const docs=[document('Horti','12345678000190',[{name:'Tomate italiano',code:'123',unit:'kg',productId:'a'}],[{productId:'a',quantity:2,netUnitCost:9}])];
 const d={supplier:'Horti',supplierCnpj:'12345678000190',items};
 assert.equal(findHistoricalMatches(d,docs,[p('a','Tomate italiano','123')])[0].confident,false);
 assert.equal(attachPreviousPurchases(d,docs,[p('a','Tomate italiano','123')]).items[0].productId,undefined);
});

test('sem vinculo inequívoco no documento antigo nao inventa productId',async()=>{
 const {findHistoricalMatches}=await api;
 const notes=[document('Horti','12345678000190',
  [{name:'Tomate',code:'1',unit:'kg'},{name:'Uva',code:'2',unit:'kg'}],
  [{productId:'t',quantity:1,netUnitCost:5},{productId:'u',quantity:1,netUnitCost:8}])];
 const candidates=[p('x','Outro tomate','X'),p('y','Tomate extra','Y')];
 const [hit]=findHistoricalMatches({supplier:'Horti',supplierCnpj:'12345678000190',items:[{name:'TOMATE',code:'1',unit:'kg'}]},notes,candidates);
 assert.equal(hit.productId,'');
});

test('media historica ponderada por quantidade e lista categoria, fornecedor e subtotal',async()=>{
 const {purchasePlan}=await api;
 const catalog=[p('a','Tomate','123','Hortifruti','kg',1,5,99),
  p('b','Leite','8','Laticínios','l',0,2,4),p('c','Outros','9','Outros','un',1,3,0)];
 const docs=[
  document('Horti A','12345678000190',[],[{productId:'a',quantity:1,netUnitCost:10}]),
  document('Horti B','33333333000190',[],[{productId:'a',quantity:3,netUnitCost:20}])
 ];
 const plan=purchasePlan(catalog,docs);
 assert.equal(plan.items.find(x=>x.id==='a').averagePaid,17.5);
 assert.equal(plan.items.find(x=>x.id==='a').estimate,70);
 assert.equal(plan.items.find(x=>x.id==='a').usualSupplier,'Horti B');
 assert.equal(plan.items.find(x=>x.id==='b').estimate,8);
 assert.equal(plan.total,78);
 assert.equal(plan.missingPrices,1);
 assert.equal(plan.categories.length,3);
});

test('fornecedor costumeiro pode ser indicado manualmente',async()=>{
 const {purchasePlan}=await api;
 const catalog=[{...p('a','Tomate','123'),preferredSupplier:'Feira livre'}];
 const plan=purchasePlan(catalog,[]);
 assert.equal(plan.items[0].usualSupplier,'Feira livre');
 assert.equal(plan.items[0].supplierSource,'manual');
});

test('compras realizadas agrupadas por CNPJ sem misturar fornecedores',async()=>{
 const {purchaseHistoryBySupplier}=await api;
 const docs=[
  document('Horti A','12345678000190',[{name:'Uva'}],[],22),
  document('Horti A LTDA','12345678000190',[{name:'Tomate'}],[],30),
  document('Mercado B','33333333000190',[{name:'Leite'}],[],40)
 ];
 const list=purchaseHistoryBySupplier(docs);
 assert.equal(list.length,2);
 assert.equal(list[0].documents.length,2);
 assert.equal(list[0].total,52);
});
