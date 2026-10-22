// Run locally in an interactive terminal. Never pass credentials as arguments.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { emitKeypressEvents } from 'node:readline';

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
  if (!/^[a-z]{20}$/.test(expectedProject || '')) throw new Error('Supply only the verified test project reference.');
  let connectionString = await hidden('Database URL (hidden): ');
  const target = new URL(connectionString);
  if (target.protocol !== 'postgresql:' && target.protocol !== 'postgres:') throw new Error('Invalid database URL');
  if (target.hostname !== `db.${expectedProject}.supabase.co` &&
      !(target.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(target.username).endsWith(`.${expectedProject}`))) throw new Error('Project mismatch');
  // Parse explicitly: connection-string sslmode parameters must never override
  // certificate verification or downgrade the protected connection.
  client = new pg.Client({
    host: target.hostname, port: Number(target.port || 5432),
    database: decodeURIComponent(target.pathname.slice(1)),
    user: decodeURIComponent(target.username), password: decodeURIComponent(target.password),
    ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000
  });
  connectionString = '';
  let password = await hidden('Provisional DBA password (hidden): ');
  let confirmation = await hidden('Repeat provisional password (hidden): ');
  if (password !== confirmation || Buffer.byteLength(password) < 6 || Buffer.byteLength(password) > 72) throw new Error('Password confirmation or length invalid');
  const hash = await bcrypt.hash(password, 12);
  password = ''; confirmation = '';
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL log_parameter_max_length = 0");
  await client.query("SET LOCAL log_parameter_max_length_on_error = 0");
  await client.query("SET LOCAL pgaudit.log_parameter = off");
  const settings = await client.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS failure, current_setting('pgaudit.log_parameter', true) AS audit");
  if (settings.rows[0]?.normal !== '0' || settings.rows[0]?.failure !== '0' || settings.rows[0]?.audit !== 'off') throw new Error('Protected parameter logging unavailable');
  // Statement text contains no password or hash. The private function accepts
  // only bcrypt hashes and can only be called by the database owner.
  await client.query('SELECT private.bootstrap_superadmin($1, $2)', ['admin.master', hash]);
  await client.query('COMMIT');
  console.log('DBA created. First login requires a new password.');
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  // Never print driver exceptions, parameters, URLs, hashes, or secret inputs.
  console.error('Bootstrap not completed. Check the verified project, protected connection and migration.');
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
