const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const parser=import('../lib/cash-report-parser.mjs');
const fixture=`Fantasia: Leve CAFÈ
Caixa do dia: 10/10/2026
Caixa Nº: 003
Operador: ADMINISTRADOR
Data/Hora Abertura: 10/10/2026 08:00:39
Fechamento de Caixa
NFC-e
Espécie                              Valor
(+)CARTAO CREDITO                    R$ 130,00
(+)CARTAO DEBITO                     R$ 21,00
(+)CREDITO                           R$ 181,00
(+)DEBITO                            R$ 72,00
(+)OUTRAS                            R$ 165,00
(=)Total                             R$ 569,00
(=)Total em Cartão/POS               R$ 151,00
Movimentações Manuais
Espécie                              Valor
(+)DINHEIRO                          R$ 238,50
Motivo: SUPRIMENTO - ABERTURA DE CAIXA
ABERTURA
(+)DINHEIRO                          R$ 3,00
Motivo: SUPRIMENTO - TROCO RUDI SEXTA
(-)DINHEIRO                          R$ 241,50
Motivo: SANGRIA - FECHAMENTO DE CAIXA - Fechamento Sabadou
dos cria 10/10
Caixa Digital
CARTAO CREDITO           R$ 130,00         R$ 0,00
CARTAO DEBITO            R$ 21,00          R$ 0,00
CREDITO                  R$ 181,00         R$ 0,00
DEBITO                   R$ 72,00          R$ 0,00
OUTRAS                   R$ 165,00         R$ 0,00
(=)Total                 R$ 569,00         R$ 0,00
Caixa Físico
`;
test('PDF 1501: detecta vendas uma vez e ignora sangria usada apenas no fechamento',async()=>{
 const {parseCashReport}=await parser;
 const r=parseCashReport(fixture);
 assert.equal(r.day,'2026-10-10');assert.equal(r.register,'003');
 assert.equal(r.operator,'ADMINISTRADOR');
 assert.equal(r.cartaoCredito,'130.00');assert.equal(r.cartaoDebito,'21.00');
 assert.equal(r.credito,'181.00');assert.equal(r.debito,'72.00');
 assert.equal(r.outras,'165.00');assert.equal(r.reportedTotal,569);
 assert.equal(r.reportedPos,151);
 assert.equal(r.movements.length,2);
 assert.deepEqual(r.movements.map(m=>m.amount),['238.50','3.00']);
 assert.deepEqual(r.movements.map(m=>m.type),['suprimento','suprimento']);
 assert.equal(r.requiresReview,true);
});
test('inconsistência de total fiscal cria alerta',async()=>{
 const {parseCashReport}=await parser;
 assert.ok(parseCashReport(fixture.replace('R$ 569,00','R$ 599,00')).importWarnings.some(s=>s.includes('não confere')));
});
test('ignora valores duplicados na seção caixa digital',async()=>{
 const {parseCashReport}=await parser;
 const p=parseCashReport(fixture.replace('CARTAO CREDITO           R$ 130,00         R$ 0,00','CARTAO CREDITO           R$ 999,00         R$ 0,00'));
 assert.equal(p.cartaoCredito,'130.00');
});


test('PDF real: valores antes das modalidades NFC-e, PIX e dinheiro de vendas',async()=>{
 const {parseCashReport}=await parser;
 const {cashTotals}=await import('../lib/cash-closing.mjs');
 const extracted=`Caixa do dia: 21/10/2026
Caixa Nº: 003
Operador: TESTE
NFC-e
R$ 462,50 (+)CARTAO CREDITO
R$ 267,00 (+)CARTAO DEBITO
R$ 292,00 (+)DEBITO
R$ 253,00 (+)DINHEIRO
R$ 401,00 (+)PIX
(=)Total R$ 1.675,50
(=)Total em Cartão/POS R$ 729,50
Movimentações Manuais
(+)DINHEIRO R$ 120,00
Motivo: SUPRIMENTO - TROCO
(-)DINHEIRO R$ 100,00
Motivo: SANGRIA - RETIRADA
Caixa Digital
CARTAO CREDITO R$ 999,00 R$ 0,00
Caixa Físico`;
 const result=parseCashReport(extracted);
 assert.equal(result.cartaoCredito,'462.50');
 assert.equal(result.cartaoDebito,'267.00');
 assert.equal(result.credito,'0');
 assert.equal(result.debito,'292.00');
 assert.equal(result.dinheiroVendas,'253.00');
 assert.equal(result.outras,'401.00'); // PIX agrupado em Outras até haver campo dedicado.
 assert.equal(result.reportedTotal,1675.50);
 assert.equal(result.reportedPos,729.50);
 assert.equal(result.movements.length,2);
 assert.deepEqual(result.movements.map(x=>x.type),['suprimento','sangria']);
 assert.equal(cashTotals(result).revenue,1675.50);
 assert.equal(cashTotals(result).pos,729.50);
 assert.equal(cashTotals(result).cashExpected,273);
 assert.ok(result.importWarnings.some(x=>x.includes('PIX')));
 assert.ok(!result.importWarnings.some(x=>x.includes('não confere')));
});
test('PIX e Outras coexistentes devem somar e não sobrescrever valores',async()=>{
 const {parseCashReport}=await parser;
 const r=parseCashReport(`NFC-e
R$ 401,00 (+)PIX
(+)OUTRAS R$ 75,00
(=)Total R$ 476,00
Caixa Digital`);
 assert.equal(r.outras,'476.00');
 assert.ok(!r.importWarnings.some(x=>x.includes('não confere')));
});
test('não duplicar faturamento pela tabela do caixa digital',async()=>{
 const {parseCashReport}=await parser;
 const r=parseCashReport(`NFC-e
R$ 12,00 (+)DINHEIRO
(=)Total R$ 12,00
Caixa Digital
R$ 999,00 (+)DINHEIRO
R$ 400,00 (+)PIX
Caixa Físico`);
 assert.equal(r.dinheiroVendas,'12.00');
 assert.equal(r.outras,'0');
});

