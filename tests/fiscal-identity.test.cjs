const fs=require('node:fs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = import('../lib/fiscal-identity.mjs');
const { syntheticCnpj, formatCnpj } = require('./helpers/synthetic-cnpj.cjs');
const numericIssuer = syntheticCnpj('fiscal-numeric-issuer');
const issuer = '11222333000181';
const product = {id:'egg',name:'Ovo branco',unit:'un',supplierCodes:[{cnpj:issuer,code:'031232'}]};
const page = fs.readFileSync('pages/index.js','utf8');

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
  assert.equal(extractIssuerCnpj('HORTI LTDA\\nCNPJ:\\n' + formatCnpj(numericIssuer).replace('.', ' .')),numericIssuer);
  assert.equal(validSupplierCnpj('12ABC34501DE35'),true);
  assert.equal(validSupplierCnpj('12ABC34501DE34'),false);
  assert.equal(extractIssuerCnpj('EMITENTE CNPJ II.222.333/0001-81'),'11222333000181');
  assert.equal(extractIssuerCnpj('EMITENTE CNPJ 11.222.333/OO01-81'),'11222333000181');
  assert.equal(extractIssuerCnpj('EMITENTE CNPJ 11.222.333/0001-8I'),'11222333000181');
  assert.equal(extractIssuerCnpj('NOTA SINTETICA 11222333000181'),'11222333000181');
  assert.equal(extractIssuerCnpj('EMITENTE CNPJ 11.222.333/0001-80'),'');
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


test('conversion supports equivalent physical units and requires an explicit factor for packages', async()=>{
  const {receiptUnitFactor,supplierAliasConversion,prepareFiscalIdentity} = await api;
  assert.equal(receiptUnitFactor('g','kg'),0.001);
  assert.equal(receiptUnitFactor('ml','L'),0.001);
  assert.equal(receiptUnitFactor('un','pc'),1);
  assert.equal(receiptUnitFactor('cx','L'),null);
  const milk = {id:'milk',name:'Leite integral',unit:'L',supplierCodes:[{cnpj:issuer,code:'LEITE-1',unitConversion:{invoiceUnit:'cx',stockUnit:'L',factor:12}}]};
  const item = {lineId:'line-milk',name:'Leite UHT caixa 12x1L',code:'LEITE-1',unit:'cx'};
  assert.deepEqual(supplierAliasConversion(item,milk,issuer),{factor:12,invoiceUnit:'cx',stockUnit:'L',saved:true});
  const draft = prepareFiscalIdentity({supplierCnpj:issuer,items:[item]},null,[milk],[]);
  assert.equal(draft.items[0].name,'Leite integral');
  assert.equal(draft.items[0].productId,'milk');
  assert.equal(draft.items[0].conversionFactor,12);
  const unsafe = {...milk,supplierCodes:[{cnpj:issuer,code:'LEITE-1'}]};
  assert.equal(supplierAliasConversion(item,unsafe,issuer),null);
  assert.equal(prepareFiscalIdentity({supplierCnpj:issuer,items:[item]},null,[unsafe],[]).items[0].name,item.name);
});


test('synthetic CNPJ capture corpus improves only validated identifier recovery', async()=>{
  const {extractIssuerCnpj,validSupplierCnpj}=await api;
  const cases=[
    {text:'EMITENTE CNPJ 11.222.333/0001-81',expected:'11222333000181'},
    {text:'EMITENTE CNPJ II.222.333/0001-81',expected:'11222333000181'},
    {text:'NOTA SINTETICA 11222333000181',expected:'11222333000181'},
    {text:'EMITENTE CNPJ 12.ABC.345/01DE-35',expected:'12ABC34501DE35'},
    {text:'EMITENTE CNPJ 11.222.333/0001-80',expected:''}
  ];
  const legacyNumeric=raw=>{
    if(!/^\d{14}$/.test(raw)||/^(\d)\1+$/.test(raw))return false;
    const digit=(base)=>{const weights=base.length===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const sum=[...base].reduce((n,c,i)=>n+Number(c)*weights[i],0)%11;return String(sum<2?0:11-sum)};
    return raw[12]===digit(raw.slice(0,12))&&raw[13]===digit(raw.slice(0,13));
  };
  const legacyCapture=text=>{
    const header=String(text||'').split(/\b(?:DESTINAT|DADOS\s+DO\s+CLIENTE|CONSUMIDOR\s*(?=:|CNPJ\b|CPF\b|NAO\b|IDENTIFICADO\b))/i)[0];
    const candidates=[...header.matchAll(/\bCNPJ\s*[:.-]?\s*([A-Z\d]{2}\s*\.?\s*[A-Z\d]{3}\s*\.?\s*[A-Z\d]{3}\s*\/?\s*[A-Z\d]{4}\s*-?\s*[A-Z\d]{2})(?!\s*[A-Z\d])/gi)].map(m=>m[1].replace(/[.\/\s-]/g,'').toUpperCase()).filter(legacyNumeric);
    return new Set(candidates).size===1?candidates[0]:'';
  };
  let oldHits=0,newHits=0;
  for(const sample of cases){
    const old=legacyCapture(sample.text);
    const current=extractIssuerCnpj(sample.text);
    if(sample.expected&&old===sample.expected&&legacyNumeric(old))oldHits++;
    if(sample.expected&&current===sample.expected&&validSupplierCnpj(current))newHits++;
  }
  assert.equal(oldHits,1);
  assert.equal(newHits,4);
  assert.ok(page.includes("supplierCnpjConfidence: supplierCnpj ? 'alta (DV validado)'"));
  assert.match(page,/derivedIssuerCnpj/);
});