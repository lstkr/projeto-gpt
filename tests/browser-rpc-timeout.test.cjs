const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const timeoutModule = import('../lib/browser-rpc-timeout.mjs');

test('requisição sem resposta termina e cancela o transporte sem repetir gravação', async t => {
  const {boundedRpc, RPC_TIMEOUT_MS, RPC_TIMEOUT_CODE} = await timeoutModule;
  t.mock.timers.enable({apis: ['setTimeout']});
  let signal, calls = 0;
  const client = {rpc() { calls++; return {abortSignal(value) {
    signal = value; return new Promise(() => {});
  }}; }};
  const pending = boundedRpc(client, 'cash_closing_save', {});
  await Promise.resolve();
  t.mock.timers.tick(RPC_TIMEOUT_MS);
  const result = await pending;
  assert.equal(result.error.code, RPC_TIMEOUT_CODE);
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test('sucesso limpa o relógio; erro de conflito é devolvido sem alteração', async t => {
  const {boundedRpc, RPC_TIMEOUT_MS} = await timeoutModule;
  t.mock.timers.enable({apis: ['setTimeout']});
  let signal;
  const response = {data: null, error: {code: 'PT409', message: 'Conflito'}};
  const client = {rpc: () => ({abortSignal(value) {signal = value; return Promise.resolve(response);}})};
  assert.equal(await boundedRpc(client, 'cash_closing_save', {}), response);
  t.mock.timers.tick(RPC_TIMEOUT_MS);
  assert.equal(signal.aborted, false);
});

async function cashHandler(client) {
  const {boundedRpc, RPC_TIMEOUT_CODE} = await timeoutModule;
  const {prepareCashClosing, cashCorrectionAttempt} = await import('../lib/cash-correction.mjs');
  const state = {loading: false, conflict: false, error: '', timedOut: false};
  const form = {id: 'fixture', day: '2026-11-01', register: 'test', operator: 'Fixture',
    cashCounted: '10', cashReviewed: true, movements: [], revision: '1', correctionReason: 'Conferência'};
  const context = {boundedRpc, RPC_TIMEOUT_CODE, prepareCashClosing, cashCorrectionAttempt,
    supabase: client, accessCode: 'synthetic', cashConflict: false, cashForm: form,
    cashSavingRef: {current: false}, cashAttemptRef: {current: null},
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000001'},
    setCashSaving: value => {state.loading = value;}, setCashError: value => {state.error = value;},
    setCashConflict: value => {state.conflict = value;}, setCashSaveTimedOut: value => {state.timedOut = value;}};
  const source = readFileSync(require.resolve('../pages/index.js'), 'utf8');
  const body = source.match(/^  async function saveCashClosing\(event\)\{[\s\S]*?^  \}/m)[0];
  return {invoke: vm.runInNewContext('('+body+')', context), context, state, form};
}

test('conflito em outra aba mostra mensagem, preserva campos e libera o estado de salvamento', async () => {
  const client = {rpc: () => ({abortSignal: () => Promise.resolve({error: {code: 'PT409'}})})};
  const {invoke, state, form, context} = await cashHandler(client);
  await invoke({preventDefault() {}});
  assert.equal(state.loading, false);
  assert.equal(context.cashSavingRef.current, false);
  assert.equal(state.conflict, true);
  assert.match(state.error, /alterado em outra aba.*Recarregue.*campos foram mantidos/);
  assert.equal(form.cashCounted, '10');
  assert.equal(form.correctionReason, 'Conferência');
});

test('salvamento travado não deixa botão preso e oferece nova tentativa sem apagar valores', async t => {
  const {RPC_TIMEOUT_MS} = await timeoutModule;
  t.mock.timers.enable({apis: ['setTimeout']});
  const client = {rpc: () => ({abortSignal: () => new Promise(() => {})})};
  const {invoke, state, form, context} = await cashHandler(client);
  const pending = invoke({preventDefault() {}});
  await Promise.resolve();
  assert.equal(state.loading, true);
  t.mock.timers.tick(RPC_TIMEOUT_MS);
  await pending;
  assert.equal(state.loading, false);
  assert.equal(context.cashSavingRef.current, false);
  assert.equal(state.timedOut, true);
  assert.match(state.error, /demorou.*campos foram mantidos.*Tente novamente/);
  assert.equal(form.cashCounted, '10');
});
