const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const content=fs.readFileSync('pages/index.js','utf8');
const start=content.indexOf('function localizedValue(raw)');
const end=content.indexOf('async function prepareReceiptCanvases',start);
assert.ok(start>=0&&end>start);
const fn=vm.runInNewContext('const norm=v=>String(v||"").trim().toLowerCase();\n'+content.slice(start,end)+'\n({parseReceiptOcr,reconcileReceiptTotals,mergeReceiptCandidates,shouldPostReceiptItem})');
const documents=[{"total":340.78,"rows":[["0000299","MELANCIA KG",5.4,"KG",2.2,11.88],["0001015","MELAO REI KG",5.425,"KG",7.9,42.85],["0000914","LARANJA BAHIA IMPORTADA KG",2.04,"KG",10.9,22.23],["0000140","GOIABA VERMELHA KG",1.44,"KG",6.5,9.36],["0000302","AMEIXA IMPORTADA KG",0.955,"KG",16.6,15.85],["0000442","PERA WILLIAMS KG",1.115,"KG",12.75,14.21],["0000159","KIWI VERDE KG",0.595,"KG",19.8,11.78],["0000329","ABACAXI PEROLA UN",3,"UN",7.5,22.5],["0000973","MAMAO FORMOSA KG",3.08,"KG",7.9,24.33],["0000760","BANANA PRATA KG",2.86,"KG",5.9,16.87],["0100668","UVA CRIMSON THOMPSON PRETA KG",3.385,"KG",22.5,76.16],["0003573","FIGO 350GR",1,"UN",14,14],["0000183","LARANJA PERA KG",5.605,"KG",4.5,25.22],["0000353","MANGA PALMER KG",2.475,"KG",8.3,20.54],["0144231","TAXA DE ENTREGA EM DOMICILIO",1,"UN",13,13]]},{"total":367.86,"rows":[["0001015","MELAO REI KG",4.675,"KG",8.9,41.6],["0000973","MAMAO FORMOSA KG",4.495,"KG",9.4,42.25],["0130400","GOIABA VERM ESPECIAL KG",2.41,"KG",9.9,23.85],["0004553","MACA GALA NACIONAL KG",1.125,"KG",12.4,13.95],["0000442","PERA WILLIAMS KG",1.21,"KG",13.5,16.33],["0000183","LARANJA PERA KG",2.27,"KG",5.4,12.25],["0000450","PESSEGO IMPORTADO KG",0.815,"KG",16.5,13.44],["0000299","MELANCIA KG",3.755,"KG",2.7,10.13],["0102474","CAQUI CX 1KG",2,"UN",11.6,23.2],["0000760","BANANA PRATA KG",3.375,"KG",6.8,22.95],["0112429","PAO DE FORMA SEVENBOYS TRADICIONAL 500 GR",1,"PCT",6.9,6.9],["0000302","AMEIXA IMPORTADA KG",0.725,"KG",17.8,12.9],["0000558","UVA THOMPSON VERDE KG",3.125,"KG",22.5,70.31],["0003964","PRESUNTO COZIDO SADIA KG S CAPA",0.306,"KG",42.9,13.12],["0103136","QUEIJO MUSSARELA SANTA ROSA KG",0.298,"KG",38,11.32],["0000353","MANGA PALMER KG",3.37,"KG",9.9,33.36]]}];
for(const [number,document] of documents.entries()){
 test('Public grocery invoice '+(number+1)+' full fiscal reconciliation',()=>{
 const br=(n,places)=>Number(n).toFixed(places).replace('.',',');
 const text=['CODIGO DESCRICAO',...document.rows.flatMap(([code,name,qty,unit,price,total])=>[code+' '+name,br(qty,4)+' '+unit+' '+br(price,4)+' '+br(total,2)]),'QTD TOTAL DE ITENS '+document.rows.length,'SUB-TOTAL '+br(document.total,2),'VALOR TOTAL R$ '+br(document.total,2)].join('\n');
 const items=fn.parseReceiptOcr(text);
 assert.equal(items.length,document.rows.length);
 items.forEach((item,i)=>{
  const [code,name,quantity,unit,price,total]=document.rows[i];
  assert.equal(item.code,code);assert.equal(item.name,name);
  assert.ok(Math.abs(item.quantity-quantity)<=0.0005);
  assert.equal(item.unit,unit.toLowerCase());assert.equal(item.unitPrice,price);
  assert.equal(item.lineTotal,total);
 });
 assert.equal(fn.reconcileReceiptTotals(text,text,items).total,document.total);
 assert.equal(Math.round(items.reduce((sum,item)=>sum+item.lineTotal,0)*100)/100,document.total);
 assert.equal(fn.mergeReceiptCandidates(items,items).length,document.rows.length);
 });
}

test('Non-stock charges are preserved for fiscal totals but excluded from physical inventory',()=>{
  const rows=documents[0].rows;
  const fee=rows.find(row=>row[1]==='TAXA DE ENTREGA EM DOMICILIO');
  assert.ok(fee);
  assert.equal(fn.shouldPostReceiptItem({name:fee[1]}),false);
  assert.equal(fn.shouldPostReceiptItem({name:'GORJETA'}),false);
  assert.equal(fn.shouldPostReceiptItem({name:'LEITE INTEGRAL'}),true);
  assert.equal(rows.filter(row=>fn.shouldPostReceiptItem({name:row[1]})).length,14);
  assert.equal(fn.shouldPostReceiptItem({name:fee[1],stockDisposition:'stock'}),true);
});
