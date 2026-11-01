const {test} = require('node:test');
const assert = require('node:assert/strict');
const correction = import('../lib/cash-correction.mjs');
const valid = () => ({day: '2026-11-01', register: '003', operator: 'Teste',
  dinheiroVendas: '0.30', cashCounted: '0.30', cashReviewed: true, movements: []});

test('serialização monetária preserva centavos e recusa arredondamento implícito', async () => {
  const {exactCashDecimal} = await correction;
  assert.equal(exactCashDecimal('0,10'), '0.10');
  assert.equal(exactCashDecimal('00012.3'), '12.30');
  assert.equal(exactCashDecimal('99999999'), '99999999.00');
  for (const value of ['1.001', '-1', '1e3', '', 'NaN', '100000000', 0.1 + 0.2]) {
    assert.throws(() => exactCashDecimal(value));
  }
});

test('novo fechamento exige conferência e dinheiro contado, inclusive zero', async () => {
  const {prepareCashClosing} = await correction;
  const result = prepareCashClosing({...valid(), cashCounted: '0'});
  assert.equal(result.cashCounted, '0.00');
  assert.equal(result.dinheiroVendas, '0.30');
  assert.equal(result.expectedRevision, undefined);
  assert.equal(result.cashReviewed, undefined);
  assert.throws(() => prepareCashClosing({...valid(), cashReviewed: false}), /conferência/);
  assert.throws(() => prepareCashClosing({...valid(), cashCounted: ''}), /dinheiro contado/);
  assert.throws(() => prepareCashClosing({...valid(), day: '2026-02-30'}), /Data inválida/);
});

test('sangrias são verificadas em centavos exatos sem contar retirada de encerramento', async () => {
  const {prepareCashClosing} = await correction;
  const movements = [{type: 'sangria', amount: '0.10', reason: 'Compra'},
    {type: 'sangria', amount: '0.20', reason: 'Compra'},
    {type: 'sangria', amount: '5', reason: 'SANGRIA - FECHAMENTO DE CAIXA'}];
  assert.doesNotThrow(() => prepareCashClosing({...valid(), movements}));
  assert.throws(() => prepareCashClosing({...valid(), dinheiroVendas: '0.29', movements}), /Sangrias/);
});

test('correção exige motivo e versão textual sem perda de precisão', async () => {
  const {prepareCashClosing} = await correction;
  const entry = {...valid(), id: 'registro', revision: '9007199254740993', correctionReason: ' Conferência '};
  assert.equal(prepareCashClosing(entry).expectedRevision, '9007199254740993');
  assert.equal(prepareCashClosing(entry).correctionReason, 'Conferência');
  for (const patch of [{revision: undefined}, {revision: 1}, {correctionReason: ' '},
    {correctionReason: 'a'.repeat(301)}]) assert.throws(() => prepareCashClosing({...entry, ...patch}));
});

test('repetição da mesma correção mantém tentativa; campos alterados geram outra', async () => {
  const {cashCorrectionAttempt} = await correction;
  let generated = 0;
  const createId = () => `tentativa-${++generated}`;
  const entry = {id: 'registro', correctionReason: 'Revisão', cashCounted: '10.00'};
  const first = cashCorrectionAttempt(entry, null, createId);
  assert.equal(cashCorrectionAttempt({...entry}, first, createId), first);
  assert.equal(cashCorrectionAttempt({...entry, cashCounted: '11.00'}, first, createId).requestId, 'tentativa-2');
  assert.equal(generated, 2);
});
