const test = require('node:test');
const assert = require('node:assert/strict');

test('falhas anteriores à transação não tentam rollback nem executam a operação', async () => {
  const { runBootstrapTransaction } = await import('../scripts/admin/bootstrap-transaction.mjs');
  for (const failingStep of ['CONNECT', 'BEGIN']) {
    const calls = [];
    const failure = new Error('Falha sintética');
    const record = async (step) => {
      calls.push(step);
      if (step === failingStep) throw failure;
    };
    await assert.rejects(runBootstrapTransaction({
      client: { connect: () => record('CONNECT'), query: record },
      operation: () => record('OPERATION'),
      reportRollbackFailure: () => assert.fail('Sem reversão antes de BEGIN')
    }), (caught) => caught === failure);
    assert.deepEqual(calls, failingStep === 'CONNECT' ? ['CONNECT'] : ['CONNECT', 'BEGIN']);
  }
});

test('falha após BEGIN reverte e preserva o erro original mesmo se rollback falhar', async () => {
  const { runBootstrapTransaction } = await import('../scripts/admin/bootstrap-transaction.mjs');
  for (const rollbackFails of [false, true]) {
    const calls = [];
    const original = new Error('Operação sintética recusada');
    const rollbackFailure = new Error('Reversão sintética indisponível');
    const reported = [];
    await assert.rejects(runBootstrapTransaction({
      client: {
        connect: async () => calls.push('CONNECT'),
        query: async (statement) => {
          calls.push(statement);
          if (statement === 'ROLLBACK' && rollbackFails) throw rollbackFailure;
        }
      },
      operation: async () => { calls.push('OPERATION'); throw original; },
      reportRollbackFailure: (failure) => reported.push(failure)
    }), (caught) => caught === original);
    assert.deepEqual(calls, ['CONNECT', 'BEGIN', 'OPERATION', 'ROLLBACK']);
    assert.deepEqual(reported, rollbackFails ? [rollbackFailure] : []);
  }
});

test('operação bem-sucedida confirma a transação sem rollback', async () => {
  const { runBootstrapTransaction } = await import('../scripts/admin/bootstrap-transaction.mjs');
  const calls = [];
  await runBootstrapTransaction({
    client: { connect: async () => calls.push('CONNECT'), query: async (sql) => calls.push(sql) },
    operation: async () => calls.push('OPERATION'),
    reportRollbackFailure: () => assert.fail('Sucesso não exige rollback')
  });
  assert.deepEqual(calls, ['CONNECT', 'BEGIN', 'OPERATION', 'COMMIT']);
});

test('falha no COMMIT preserva o erro e tenta rollback sem atestar ausência da conta', async () => {
  const { runBootstrapTransaction } = await import('../scripts/admin/bootstrap-transaction.mjs');
  const calls = [];
  const failure = new Error('Resposta sintética perdida ao confirmar');
  await assert.rejects(runBootstrapTransaction({
    client: {
      connect: async () => calls.push('CONNECT'),
      query: async (sql) => { calls.push(sql); if (sql === 'COMMIT') throw failure; }
    },
    operation: async () => calls.push('OPERATION'),
    reportRollbackFailure: () => assert.fail('Rollback simulado disponível')
  }), (caught) => caught === failure);
  assert.deepEqual(calls, ['CONNECT', 'BEGIN', 'OPERATION', 'COMMIT', 'ROLLBACK']);
});
