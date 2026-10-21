#!/usr/bin/env python3
"""Run tenant cutover acceptance against an empty loopback PostgreSQL only."""
import os
from pathlib import Path
import subprocess
import re

ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Only loopback PGHOST allowed.')
if not os.environ.get('PGDATABASE', '').startswith('estoque_rpc_test'):
    raise SystemExit('PGDATABASE must begin estoque_rpc_test.')

def sql(statement):
    run = subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1'],input=statement,
                         text=True,capture_output=True,timeout=90)
    if run.returncode:
        raise AssertionError(run.stderr)
    return run.stdout.strip()

assert sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'") == '0', 'Database must be empty'
sql('create role anon nologin; create role authenticated nologin; create schema extensions;')
for file in ['db/schema.sql','db/access-permissions.sql','db/pending-receipts.sql','db/cash-closing.sql']:
    sql((ROOT/file).read_text(encoding='utf8'))
for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
    if migration.name.endswith('_tenant_access.sql'):
        sql("insert into private.app_users(username,password_hash,role,display_name) values ('recovery.fixture',extensions.crypt('synthetic-recovery-password',extensions.gen_salt('bf',4)),'admin','Recovery Fixture')")
        before = sql("select password_hash from private.app_users where username='recovery.fixture'")
        fault = re.sub(r'commit;\s*$', "do $$ begin raise exception 'injected cutover failure'; end $$; commit;", migration.read_text(encoding='utf8'), flags=re.I)
        run = subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1'],input=fault,text=True,capture_output=True,timeout=90)
        assert run.returncode != 0 and 'injected cutover failure' in run.stderr
        assert sql("select password_hash from private.app_users where username='recovery.fixture'") == before
        assert sql("select to_regclass('private.establishments') is null") == 't'
        assert sql("select to_regclass('public.shared_inventory') is not null") == 't'
        print('PASS failed cutover rolls back schema and preserves credentials')
    sql(migration.read_text(encoding='utf8'))
sql((ROOT/'tests/sql/tenant-access.sql').read_text(encoding='utf8'))
before = sql("select md5(string_agg(to_jsonb(r)::text,'' order by tenant_id)) from private.tenant_inventory r")
credentials = sql("select md5(string_agg(to_jsonb(r)::text,'' order by id)) from private.app_users r")
for operation in ['backup-test-reset','reset-test-data','restore-test-data']:
    sql((ROOT/f'db/operations/{operation}.sql').read_text(encoding='utf8'))
assert sql("select md5(string_agg(to_jsonb(r)::text,'' order by tenant_id)) from private.tenant_inventory r") == before
assert sql("select md5(string_agg(to_jsonb(r)::text,'' order by id)) from private.app_users r") == credentials
assert sql('select count(*) from private.app_sessions where revoked_at is null') == '0'
print('PASS operational backup/reset/restore preserves users and requires fresh login')
print('PASS tenant cutover, isolation, privileges, password gate, token rotation and fiscal/cash flows')
