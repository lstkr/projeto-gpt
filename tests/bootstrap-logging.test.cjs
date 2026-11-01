const test = require('node:test');
const assert = require('node:assert/strict');

test('logs já protegidos permitem prosseguir sem exigir SET privilegiado', async () => {
  const { verifyBootstrapLogging } = await import('../scripts/admin/bootstrap-logging.mjs');
  const statements = [];
  await verifyBootstrapLogging({ query: async (statement) => {
    statements.push(statement);
    return { rows: [{ normal: '0', failure: '0', audit: 'off' }] };
  } });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^SELECT /);
});

test('configuração insegura ou incompleta bloqueia o bootstrap sem tentar alterar permissões', async () => {
  const { verifyBootstrapLogging } = await import('../scripts/admin/bootstrap-logging.mjs');
  for (const settings of [{ normal: '-1', failure: '0', audit: 'off' },
    { normal: '0', failure: '-1', audit: 'off' }, { normal: '0', failure: '0', audit: 'on' }, undefined]) {
    await assert.rejects(verifyBootstrapLogging({ query: async (statement) => {
      assert.match(statement, /^SELECT /);
      return { rows: [settings] };
    } }), /proteção dos parâmetros nos logs/);
  }
});
