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
test('PDF 1501: detecta vendas uma vez e 3 movimentações distintas',async()=>{
 const {parseCashReport}=await parser;
 const r=parseCashReport(fixture);
 assert.equal(r.day,'2026-10-10');assert.equal(r.register,'003');
 assert.equal(r.operator,'ADMINISTRADOR');
 assert.equal(r.cartaoCredito,'130.00');assert.equal(r.cartaoDebito,'21.00');
 assert.equal(r.credito,'181.00');assert.equal(r.debito,'72.00');
 assert.equal(r.outras,'165.00');assert.equal(r.reportedTotal,569);
 assert.equal(r.reportedPos,151);
 assert.equal(r.movements.length,3);
 assert.deepEqual(r.movements.map(m=>m.amount),['238.50','3.00','241.50']);
 assert.deepEqual(r.movements.map(m=>m.type),['suprimento','suprimento','sangria']);
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
