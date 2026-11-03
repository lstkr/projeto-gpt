const test = require('node:test');
const assert = require('node:assert/strict');
const kernel = Promise.all([import('../lib/cash-insights.mjs'),import('../lib/insight-period.mjs'),import('../lib/operations-insights.mjs')]);
const period = {start:'2026-11-01',end:'2026-11-02',previousStart:'2026-10-01',previousEnd:'2026-10-02'};
const closing = (extra={}) => ({day:'2026-11-01',cartaoCredito:'0',cartaoDebito:'0',credito:'0',debito:'0',outras:'0',dinheiroVendas:'100',cashCounted:'100',movements:[],...extra});

test('vendas somam seis rubricas, sem transformar suprimento ou sangria em faturamento',async () => {
  const [{cashInsights}] = await kernel;
  const result = cashInsights([closing({cartaoCredito:'10',cartaoDebito:'20',credito:'30',debito:'40',outras:'50',
    movements:[{type:'suprimento',amount:'500',reason:'Abertura'},{type:'sangria',amount:'200',reason:'Retirada'}]})],period);
  assert.equal(result.revenue,25000n);
  assert.equal(result.shortage,30000n);
  assert.equal(Object.values(result.channels).reduce((sum,value) => sum+value,0n),result.revenue);
});

test('média usa dias distintos com fechamento, inclusive venda explicitamente zero',async () => {
  const [{cashInsights}] = await kernel;
  const result = cashInsights([closing(),closing(),closing({day:'2026-11-02',dinheiroVendas:'0',cashCounted:'0'})],period);
  assert.equal(result.count,3); assert.equal(result.days,2); assert.equal(result.average,10000n);
});

test('falta e sobra não se compensam entre caixas e sangria de encerramento não reduz caixa previsto',async () => {
  const [{cashInsights}] = await kernel;
  const result = cashInsights([closing({cashCounted:'90'}),closing({cashCounted:'120',
    movements:[{type:'sangria',amount:'100',reason:'SANGRIA - FECHAMENTO DE CAIXA'}]})],period);
  assert.equal(result.shortage,1000n); assert.equal(result.surplus,2000n);
});

test('legado sem dinheiro contado mantém vendas e informa conciliação indisponível',async () => {
  const [{cashInsights}] = await kernel;
  const result = cashInsights([closing({cashCounted:null})],period);
  assert.equal(result.revenue,10000n); assert.equal(result.withoutCount,1);
});

test('ausência, decimal inválido e data impossível não viram zero medido',async () => {
  const [{cashInsights,insightCents}] = await kernel;
  const result = cashInsights([closing({credito:'1.234'}),closing({day:'2026-02-30'})],period);
  assert.equal(result.count,0); assert.equal(result.average,null);
  assert.equal(result.invalid,1); assert.equal(result.invalidDates,1);
  for (const value of [null,'','NaN','1e5','-1','100000000']) assert.equal(insightCents(value),null);
});

test('comparação usa toda a janela equivalente e não o primeiro e último dia',async () => {
  const [{cashInsights}] = await kernel;
  const result = cashInsights([closing(),closing({day:'2026-10-01',dinheiroVendas:'40'}),closing({day:'2026-10-02',dinheiroVendas:'10'}),closing({day:'2026-10-03',dinheiroVendas:'999'})],period);
  assert.equal(result.previousRevenue,5000n); assert.equal(result.variation,10000n);
  assert.equal(cashInsights([closing()],period).variation,null);
});

test('janela parcial mensal respeita fevereiro e janela anual ajusta ano bissexto',async () => {
  const [, {insightPeriod}] = await kernel;
  const month = insightPeriod({month:'2024-03',scope:'month',today:'2024-03-30'});
  assert.equal(month.end,'2024-03-30'); assert.equal(month.previousEnd,'2024-02-29');
  const year = insightPeriod({month:'2024-02',scope:'year',today:'2024-02-29'});
  assert.equal(year.previousEnd,'2023-02-28'); assert.equal(year.start,'2024-01-01');
  assert.equal(insightPeriod({month:'2026-13',today:'2026-11-02'}),null);
});

test('meses completos preservam seus limites e relógio segue o fuso do negócio',async () => {
  const [, {insightPeriod,businessToday}] = await kernel;
  const result = insightPeriod({month:'2026-10',scope:'month',today:'2026-11-02'});
  assert.equal(result.end,'2026-10-31'); assert.equal(result.previousEnd,'2026-09-30');
  assert.equal(result.partial,false);
  assert.equal(businessToday(new Date('2026-11-02T01:00:00Z')),'2026-11-01');
});

test('estoque preserva custo fracionário por unidade e compras usam emissão, sem fallback para importação',async () => {
  const [,,{operationsInsights}] = await kernel;
  const result = operationsInsights({period,products:[{stock:'450',cost:'0.035',min:'500'}],documents:[
    {date:'02/11/2026',total:'10.25'},{date:'2026-10-02',total:'99'},{date:'',importedAt:'2026-11-02',total:'50'}]});
  assert.equal(result.stock,1575n); assert.equal(result.purchases,1025n);
  assert.equal(result.purchaseCount,1); assert.equal(result.unknownInvoices,1); assert.equal(result.low,1);
});

test('indicadores não alteram entradas e formatação conserva centavos e totais grandes',async () => {
  const [{cashInsights,insightMoney}] = await kernel;
  const entries = [closing()]; const before=structuredClone(entries);
  cashInsights(entries,period); assert.deepEqual(entries,before);
  assert.equal(insightMoney(999999999999999901n),'R$ 9.999.999.999.999.999,01');
  assert.equal(insightMoney(null),'Sem dados');
});

test('rubrica omitida segue B1 como zero, mas null explícito invalida o registro',async () => {
  const [{cashInsights}] = await kernel;
  const sparse={day:'2026-11-01',dinheiroVendas:'100',cashCounted:'100',movements:[]};
  assert.equal(cashInsights([sparse],period).revenue,10000n);
  assert.equal(cashInsights([{...sparse,credito:null}],period).invalid,1);
});

test('movimento inválido limita conciliação, sem derrubar vendas, e datas nulas são sinalizadas',async () => {
  const [{cashInsights}] = await kernel;
  const result=cashInsights([closing({movements:[null]}),null],period);
  assert.equal(result.revenue,10000n); assert.equal(result.withoutCount,1); assert.equal(result.invalidDates,1);
});
