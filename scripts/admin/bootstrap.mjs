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
  client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 });
  connectionString = '';
  let password = await hidden('Provisional DBA password (hidden): ');
  let confirmation = await hidden('Repeat provisional password (hidden): ');
  if (password !== confirmation || Buffer.byteLength(password) < 6 || Buffer.byteLength(password) > 72) throw new Error('Password confirmation or length invalid');
  const hash = await bcrypt.hash(password, 12);
  password = ''; confirmation = '';
  await client.connect();
  // Statement text contains no password or hash. The private function accepts
  // only bcrypt hashes and can only be called by the database owner.
  await client.query('SELECT private.bootstrap_superadmin($1, $2)', ['admin.master', hash]);
  console.log('DBA created. First login requires a new password.');
} catch {
  // Never print driver exceptions, parameters, URLs, hashes, or secret inputs.
  console.error('Bootstrap not completed. Check the verified project, protected connection and migration.');
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
