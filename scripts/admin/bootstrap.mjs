// Run locally in an interactive terminal. Never pass credentials as arguments.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { emitKeypressEvents } from 'node:readline';
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
  client = new pg.Client({
    ...connection,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  });
  connectionString = '';
  let password = await hidden('Provisional DBA password (hidden): ');
  let confirmation = await hidden('Repeat provisional password (hidden): ');
  validateDbaPassword(password, confirmation);
  const hash = await bcrypt.hash(password, 12);
  password = ''; confirmation = '';
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL log_parameter_max_length = 0");
  await client.query("SET LOCAL log_parameter_max_length_on_error = 0");
  await client.query("SET LOCAL pgaudit.log_parameter = off");
  const settings = await client.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS failure, current_setting('pgaudit.log_parameter', true) AS audit");
  validateProtectedLogging(settings.rows[0]);
  // Statement text contains no password or hash. The private function accepts
  // only bcrypt hashes and can only be called by the database owner.
  await client.query('SELECT private.bootstrap_superadmin($1, $2)', ['admin.master', hash]);
  await client.query('COMMIT');
  console.log('DBA created. First login requires a new password.');
} catch (failure) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  // Never print driver exceptions, parameters, URLs, hashes, or secret inputs.
  console.error(bootstrapFailureMessage(failure));
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
