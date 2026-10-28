const test = require('node:test');
const assert = require('node:assert/strict');

const PROJECT_REF = 'abcdefghijklmnopqrst';
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const POOLER_HOST = 'aws-1-us-east-1.pooler.supabase.com';

async function loadBootstrapConnection() {
  return import('../scripts/admin/bootstrap-connection.mjs');
}

test('aceita conexão direta e session pooler na porta 5432 com TLS feito pelo cliente', async () => {
  const { parseBootstrapConnection } = await loadBootstrapConnection();
  const direct = parseBootstrapConnection(
    `postgresql://postgres:p%40ss%3Aword@${DIRECT_HOST}:5432/postgres`, PROJECT_REF
  );
  const session = parseBootstrapConnection(
    `postgresql://postgres.${PROJECT_REF}:senha@${POOLER_HOST}:5432/postgres`, PROJECT_REF
  );

  assert.equal(direct.password, 'p@ss:word');
  assert.equal(direct.port, 5432);
  assert.equal(session.user, `postgres.${PROJECT_REF}`);
  assert.equal(session.host, POOLER_HOST);
});

test('rejeita cada formato de destino com mensagem específica', async () => {
  const { parseBootstrapConnection } = await loadBootstrapConnection();
  const failures = [
    ['', PROJECT_REF, 'URL de conexão vazia'],
    [`postgresql://postgres:[YOUR-PASSWORD]@${DIRECT_HOST}/postgres`, PROJECT_REF, 'A URL ainda contém o marcador [YOUR-PASSWORD]'],
    ['not a url', PROJECT_REF, 'Formato de URL inválido'],
    [`https://postgres:SENSITIVE_PASSWORD_VALUE@${DIRECT_HOST}/postgres`, PROJECT_REF, 'Protocolo inválido'],
    [`postgresql://postgres@${DIRECT_HOST}/postgres`, PROJECT_REF, 'não contém a senha do banco'],
    [`postgresql://postgres:senha@${POOLER_HOST}:6543/postgres`, PROJECT_REF, 'porta 6543'],
    [`postgresql://postgres:SENSITIVE_PASSWORD_VALUE@${DIRECT_HOST}:5433/postgres`, PROJECT_REF, 'Porta não aceita'],
    [`postgresql://postgres:SENSITIVE_PASSWORD_VALUE@${DIRECT_HOST}:5432/outro`, PROJECT_REF, 'banco da URL deve ser postgres'],
    [`postgresql://outro:SENSITIVE_PASSWORD_VALUE@${DIRECT_HOST}/postgres`, PROJECT_REF, 'usuário da conexão direta deve ser postgres'],
    [`postgresql://postgres:SENSITIVE_PASSWORD_VALUE@${POOLER_HOST}:5432/postgres`, PROJECT_REF, 'usuário da conexão não contém o ref esperado'],
    [`postgresql://postgres.sobrenome:SENSITIVE_PASSWORD_VALUE@${POOLER_HOST}:5432/postgres`, PROJECT_REF, 'usuário da conexão não contém o ref esperado'],
    ['postgresql://postgres:SENSITIVE_PASSWORD_VALUE@db.outroprojetoref.supabase.co/postgres', PROJECT_REF, 'host não corresponde ao ref confirmado'],
    [`postgresql://postgres:SENSITIVE_PASSWORD_VALUE@${DIRECT_HOST}/postgres`, 'ref-invalido', 'Ref inválido']
  ];

  for (const [connectionString, reference, expectedText] of failures) {
    assert.throws(() => parseBootstrapConnection(connectionString, reference), (error) => {
      assert.ok(error.message.includes(expectedText));
      assert.doesNotMatch(error.message, /SENSITIVE_PASSWORD_VALUE|abcdefghijklmnopqrst|aws-1-us-east-1/);
      return true;
    });
  }
});

test('classifica falhas de senha, TLS, rede, migração e estado do bootstrap sem expor exceções', async () => {
  const { bootstrapFailureMessage, validateDbaPassword, validateProtectedLogging } = await loadBootstrapConnection();
  const cases = [
    [{ code: '28P01', message: 'SENSITIVE_PASSWORD_VALUE' }, 'recusou a autenticação'],
    [{ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'SENSITIVE_CERTIFICATE_PATH' }, 'validação TLS falhou'],
    [{ code: 'ENOTFOUND', message: 'SENSITIVE_DATABASE_HOST' }, 'alcançar o PostgreSQL'],
    [{ code: '42883', message: 'SENSITIVE_QUERY' }, 'função de bootstrap não foi encontrada'],
    [{ code: '3F000', message: 'SENSITIVE_SCHEMA' }, 'função de bootstrap não foi encontrada'],
    [{ code: '42P01', message: 'SENSITIVE_TABLE' }, 'função de bootstrap não foi encontrada'],
    [{ code: '23505', message: 'SENSITIVE_USERNAME' }, 'Bootstrap já foi realizado'],
    [{ code: '42501', message: 'SENSITIVE_PRIVILEGE_DETAIL' }, 'não tem permissão para concluir o bootstrap'],
    [{ code: 'PROTECTED_PARAMETER_LOGGING', message: 'SENSITIVE_SETTING' }, 'proteção dos parâmetros nos logs'],
    [{ message: 'SENSITIVE_DRIVER_DETAIL' }, 'falha não classificada']
  ];

  for (const [failure, expectedText] of cases) {
    const safeMessage = bootstrapFailureMessage(failure);
    assert.match(safeMessage, new RegExp(expectedText, 'i'));
    assert.doesNotMatch(safeMessage, /SENSITIVE_/);
  }

  assert.throws(() => validateDbaPassword('senha1', 'senha2'), /não coincidem/);
  assert.throws(() => validateProtectedLogging({ normal: '1', failure: '1', audit: 'on' }), /proteção dos parâmetros/);
});

test('URL com caracteres de senha sem codificação gera mensagem segura', async () => {
  const { bootstrapFailureMessage, parseBootstrapConnection } = await loadBootstrapConnection();
  const privateHost = 'db.sensitive-host-value.supabase.co';
  let validationFailure;

  try {
    parseBootstrapConnection(`postgresql://postgres:SENSITIVE_PASSWORD_VALUE#SENSITIVE_FRAGMENT@${privateHost}/postgres`, PROJECT_REF);
  } catch (failure) {
    validationFailure = failure;
  }

  assert.ok(validationFailure);
  const safeMessage = bootstrapFailureMessage(validationFailure);
  assert.match(safeMessage, /caracteres reservados/);
  assert.doesNotMatch(safeMessage, /SENSITIVE_PASSWORD_VALUE|SENSITIVE_FRAGMENT|sensitive-host-value/);
});
