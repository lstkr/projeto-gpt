// Execute localmente em terminal interativo; nunca passe credenciais como argumentos.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { emitKeypressEvents } from 'node:readline';
import { runBootstrapTransaction } from './bootstrap-transaction.mjs';
import {
  bootstrapFailureMessage,
  parseBootstrapConnection,
  validateDbaPassword,
  validateProtectedLogging,
  validateProjectReference
} from './bootstrap-connection.mjs';

async function hidden(label) {
  if (!process.stdin.isTTY) throw new Error('Interactive protected input required.');
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish() { process.stdin.off('keypress', key); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
    function key(text, data) {
      if (data?.ctrl && data.name === 'c') { finish(); reject(new Error('Cancelled')); }
      else if (data?.name === 'return') { finish(); resolve(value); }
      else if (data?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !data?.ctrl) value += text;
    }
    process.stdin.on('keypress', key);
  });
}

let client;
try {
  const expectedProject = process.argv[2];
  validateProjectReference(expectedProject);
  let connectionString = await hidden('Database URL (hidden): ');
  const connection = parseBootstrapConnection(connectionString, expectedProject);
  connectionString = '';
  let password = await hidden('Provisional DBA password (hidden): ');
  let confirmation = await hidden('Repeat provisional password (hidden): ');
  validateDbaPassword(password, confirmation);
  const hash = await bcrypt.hash(password, 12);
  password = ''; confirmation = '';
  client = new pg.Client({
    ...connection,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  });
  await runBootstrapTransaction({ client, operation: async () => {
    await client.query("SET LOCAL log_parameter_max_length = 0");
    await client.query("SET LOCAL log_parameter_max_length_on_error = 0");
    await client.query("SET LOCAL pgaudit.log_parameter = off");
    const settings = await client.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS failure, current_setting('pgaudit.log_parameter', true) AS audit");
    validateProtectedLogging(settings.rows[0]);
    // Parâmetros não entram no texto SQL; a função privada aceita somente hashes
    // bcrypt e só pode ser chamada pelo proprietário do banco.
    await client.query('SELECT private.bootstrap_superadmin($1, $2)', ['admin.master', hash]);
  }, reportRollbackFailure: (failure) => {
    console.error(`A reversão da transação também falhou: ${bootstrapFailureMessage(failure)}`);
  } });
  console.log('DBA created. First login requires a new password.');
} catch (failure) {
  // Exceções do driver e entradas podem conter segredos; exiba só mensagens constantes.
  console.error(bootstrapFailureMessage(failure));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.end(); }
    catch (failure) {
      console.error(`Falha ao encerrar a conexão: ${bootstrapFailureMessage(failure)}`);
      process.exitCode = 1;
    }
  }
}
