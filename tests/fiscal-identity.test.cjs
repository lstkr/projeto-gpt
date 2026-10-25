const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = import('../lib/fiscal-identity.mjs');
const issuer = '11222333000181';
const product = {id:'egg',name:'Ovo branco',unit:'un',supplierCodes:[{cnpj:issuer,code:'031232'}]};

test('issuer recognition validates checksum and never selects recipient or ambiguous header', async()=>{
  const {validSupplierCnpj,extractIssuerCnpj,formatSupplierCnpj} = await api;
  assert.equal(validSupplierCnpj(issuer),true);
  assert.equal(validSupplierCnpj('11111111111111'),false);
  assert.equal(validSupplierCnpj('11222333000180'),false);
  assert.equal(extractIssuerCnpj('Emitente CNPJ 11.222.333/0001-81\nCONSUMIDOR CNPJ 45.723.174/0001-10'),issuer);
  assert.equal(extractIssuerCnpj('CONSUMIDOR CNPJ 11.222.333/0001-81'),'');
  assert.equal(extractIssuerCnpj('DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA\nEmitente CNPJ 11.222.333/0001-81'),issuer);
  assert.equal(extractIssuerCnpj('CNPJ 11111111111111'),'');
  assert.equal(extractIssuerCnpj('CNPJ 12.ABC.345/01DE-35'),'12ABC34501DE35');
  assert.equal(extractIssuerCnpj('HORTI LTDA\nCNPJ:\n92 .192.798/0001-39'),'92192798000139');
  assert.equal(validSupplierCnpj('12ABC34501DE35'),false);
  assert.equal(formatSupplierCnpj('87397865000979'),'87.397.865/0009-79');
  assert.equal(formatSupplierCnpj('12ABC34501DE35'),'12.ABC.345/01DE-35');
  assert.equal(formatSupplierCnpj('87-397'),'87.397');
});

test('supplier code match requires valid issuer and a unique catalog target', async()=>{
  const {supplierAliasProduct} = await api;
  const item = {name:'OVO',code:'031232',unit:'un'};
  assert.equal(supplierAliasProduct(item,[product],issuer).id,'egg');
  assert.equal(supplierAliasProduct(item,[product],''),null);
  assert.equal(supplierAliasProduct(item,[product],'12345678000190'),null);
  assert.equal(supplierAliasProduct(item,[product,{...product,id:'other'}],issuer),null);
  assert.equal(product.supplierCodes[0].code,'031232');
  assert.equal(supplierAliasProduct({...item,code:'31232'},[product],issuer),null);
  assert.equal(supplierAliasProduct({...item,code:'31232'},[{...product,supplierCodes:[...product.supplierCodes,{cnpj:issuer,code:'31232'}]}],issuer).id,'egg');
});

test('draft uses existing supplier and standard name while preserving source and manual edits',async()=>{
  const {prepareFiscalIdentity} = await api;
  const draft = {supplier:'OCR errado',supplierCnpj:issuer,items:[{lineId:'line-egg',name:'OVO BR',code:'031232',unit:'un'}]};
  const first = prepareFiscalIdentity(draft,null,[product],[{supplier:'Fornecedor cadastrado',supplierCnpj:issuer}]);
  assert.equal(first.supplier,'Fornecedor cadastrado');
  assert.equal(first.originalSupplier,'OCR errado');
  assert.equal(first.items[0].name,'Ovo branco');
  assert.equal(first.items[0].originalName,'OVO BR');
  assert.equal(first.items[0].originalCode,'031232');
  assert.equal(draft.items[0].name,'OVO BR');
  const edited = {...first,items:[{...first.items[0],name:'Ovo conferido',manualName:true}]};
  assert.equal(prepareFiscalIdentity(edited,first,[product],[]).items[0].name,'Ovo conferido');
  const differentUnit = {...draft,items:[{...draft.items[0],unit:'cx'}]};
  assert.equal(prepareFiscalIdentity(differentUnit,null,[product],[]).items[0].name,'OVO BR');
  assert.equal(prepareFiscalIdentity(draft,null,[product],[],[{id:'s',cnpj:issuer,name:'Cadastro permanente'}]).supplier,'Cadastro permanente');
});
