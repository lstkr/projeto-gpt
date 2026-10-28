const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { scanInstallSql, scanSql } = require('../scripts/admin/clean-install-safety.cjs');
const root = path.resolve(__dirname, '..');
const plan = require('../scripts/admin/clean-install-plan.json');

test('roteiro só contém as instruções destrutivas autorizadas', () => {
  const files = [...plan.base, ...plan.migrations];
  assert.equal(plan.base.length, 4);
  assert.equal(plan.migrations.length, 9);
  assert.deepEqual(files, [
    'db/schema.sql', 'db/access-permissions.sql', 'db/pending-receipts.sql', 'db/cash-closing.sql',
    'supabase/migrations/20261019201520_inventory_validate_session.sql',
    'supabase/migrations/20261020221500_fiscal_write_integrity.sql',
    'supabase/migrations/20261021143000_external_fiscal_rate_limit.sql',
    'supabase/migrations/20261021232050_tenant_access.sql',
    'supabase/migrations/20261021233206_count_guard_search_path.sql',
    'supabase/migrations/20261022020602_cash_closing_integrity.sql',
    'supabase/migrations/20261022145500_admin_password_recovery.sql',
    'supabase/migrations/20261022174354_expose_cancel_audit_columns_on_tenant_pending_view.sql',
    'supabase/migrations/20261023000500_user_directory_update.sql'
  ]);
  assert.equal(plan.supabaseRef, 'zybnekctgrjmygdkuwyr');
  const baselineHash = crypto.createHash('sha256');
  for (const file of plan.base) {
    baselineHash.update(`${file}\0${require('node:fs').readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')}\0`);
  }
  assert.equal(baselineHash.digest('hex'), plan.baseSha256);
  assert.deepEqual(plan.authorizedDrops.map(({ file, line, kind }) => `${file}:${line}:${kind}`), [
    'db/schema.sql:15:POLICY', 'db/schema.sql:35:POLICY', 'db/schema.sql:50:POLICY',
    'db/schema.sql:62:POLICY', 'db/access-permissions.sql:16:POLICY',
    'db/pending-receipts.sql:16:POLICY', 'db/pending-receipts.sql:142:CONSTRAINT',
    'db/cash-closing.sql:13:POLICY',
    'supabase/migrations/20261021232050_tenant_access.sql:9:CONSTRAINT',
    'supabase/migrations/20261021232050_tenant_access.sql:62:CONSTRAINT',
    'supabase/migrations/20261021232050_tenant_access.sql:78:CONSTRAINT'
  ]);
  assert.deepEqual(plan.authorizedDeleteCascades, [
    { file: 'db/schema.sql', line: 41, table: 'private.app_sessions' },
    { file: 'db/access-permissions.sql', line: 5, table: 'private.user_permissions' }
  ]);
  assert.deepEqual(scanInstallSql(root, plan), []);
});

test('scanner veta DROP fora da allowlist e DROP CASCADE com arquivo e linha', () => {
  const errors = scanSql('extra.sql', 'DROP TABLE private.app_users CASCADE;', plan);
  assert.deepEqual(errors, [
    'extra.sql:1: DROP TABLE CASCADE não autorizado'
  ]);
});

test('scanner veta TRUNCATE, DELETE sem WHERE e cascata adicional', () => {
  const source = [
    'TRUNCATE private.app_users;',
    'DELETE FROM private.app_users;',
    'create table private.extra(user_id uuid references private.app_users(id) on delete cascade);'
  ].join('\n');
  assert.deepEqual(scanSql('extra.sql', source, plan), [
    'extra.sql:1: TRUNCATE não permitido',
    'extra.sql:2: DELETE sem WHERE',
    'extra.sql:3: ON DELETE CASCADE não autorizado'
  ]);
});

test('scanner também veta DELETE sem WHERE no fim de arquivo sem ponto e vírgula', () => {
  assert.deepEqual(scanSql('extra.sql', 'DELETE FROM private.app_users'), [
    'extra.sql:1: DELETE sem WHERE'
  ]);
});

test('scanner aceita DELETE limitado e ignora palavras em comentários e strings', () => {
  const source = "-- DROP TABLE x;\nselect 'TRUNCATE';\ndelete from private.app_users where id = gen_random_uuid();";
  assert.deepEqual(scanSql('safe.sql', source, plan), []);
});

test('executável recusa outro ref remoto antes de solicitar credenciais ou conectar', () => {
  const ref = 'abcdefghijklmnopqrst';
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, ['scripts/admin/install-clean-database.py', '--confirm-ref', ref], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ESTOQUE_SUPABASE_ALLOWED_REF: ref, PGHOST: `db.${ref}.supabase.co`,
      PGDATABASE: 'postgres', PGUSER: 'postgres' },
    timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /projeto Estoque\+ DB autorizado/);
});
