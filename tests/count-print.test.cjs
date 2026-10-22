const test=require('node:test');
const assert=require('node:assert/strict');
const print=import('../lib/count-print.mjs');
const source={paper:'a4',establishment:'Unidade Teste',reference:'CTG-001',
  responsible:'Funcionário',mode:'blind',
  items:[{name:'Tomate',sku:'00123',category:'Hortifruti',unit:'kg',
    expected:15.500,counted:8.123,cost:299,salePrice:99,stock:15.5}]};
const issuedAt=new Date('2026-10-22T15:00:00Z');

test('blind print is genuinely blind, white-lists content and never changes stock',async()=>{
  const {countPrintHtml}=await print;
  const html=countPrintHtml(source,issuedAt);
  assert.match(html,/Folha de contagem cega/);
  assert.match(html,/00123|Tomate|Hortifruti|Unidade Teste/);
  assert.match(html,/A4 portrait/);
  assert.match(html,/_______/);
  assert.doesNotMatch(html,/15,5|8,123|299|99|Estoque<\/th>|Dif\.<\/th>/);
  assert.equal(source.items[0].stock,15.5);
});
test('difference report shows counted/expected and signed deviation, but no cost',async()=>{
  const {countPrintHtml}=await print;
  const html=countPrintHtml({...source,mode:'differences'},issuedAt);
  assert.match(html,/Relatório de conferência/);
  assert.match(html,/15,5/);
  assert.match(html,/8,123/);
  assert.match(html,/-7,377/);
  assert.doesNotMatch(html,/>299<|>99</);
});
test('thermal widths 58 and 80 use separate page sizes and short fonts',async()=>{
  const {countPrintHtml}=await print;
  for(const [paper,size] of [['thermal58','58mm 297mm'],['thermal80','80mm 297mm']]){
    const html=countPrintHtml({...source,paper},issuedAt);
    assert.ok(html.includes('size:'+size));
    assert.match(html,/font-size:9px/);
    assert.match(html,/table-header-group|break-inside:avoid/);
  }
});
test('every untrusted field is escaped, no inline executable elements',async()=>{
  const {countPrintHtml}=await print;
  const payload='<img src=x onerror="alert(1)">';
  const html=countPrintHtml({paper:'thermal58',mode:'differences',
    establishment:payload,reference:payload,responsible:payload,
    items:[{name:payload,sku:payload,unit:payload,category:payload,expected:1,counted:1}]},issuedAt);
  assert.doesNotMatch(html,/<img|<script|onerror=/i);
  assert.match(html,/&lt;img/);
});
test('invalid paper, mode, huge items or time rejects early',async()=>{
  const {countPrintHtml}=await print;
  assert.throws(()=>countPrintHtml({...source,paper:'58; background:red'},issuedAt),RangeError);
  assert.throws(()=>countPrintHtml({...source,mode:'destroy'},issuedAt),RangeError);
  assert.throws(()=>countPrintHtml({...source,items:undefined},issuedAt),RangeError);
  assert.throws(()=>countPrintHtml({...source,items:Array(2001).fill({})},issuedAt),RangeError);
  assert.throws(()=>countPrintHtml(source,'invalid'),RangeError);
});
test('fractional units incompatible with precision require review rather than truncation',async()=>{
  const {countPrintHtml}=await print;
  const html=countPrintHtml({...source,mode:'differences',
    items:[{name:'Copo',unit:'un',expected:2.5,counted:2.5},
      {name:'Açúcar',unit:'kg',expected:0.0005,counted:0.001}]},issuedAt);
  assert.match(html,/Conferir/);
  assert.doesNotMatch(html,/NaN|Infinity/);
});
