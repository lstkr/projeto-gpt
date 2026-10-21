#!/usr/bin/env python3
"""Integration tests against an EMPTY, disposable localhost PostgreSQL database.

No application secrets or production connection strings are used. Requires psql.
Run from repository root: PGHOST=127.0.0.1 PGDATABASE=estoque_rpc_test ... python3 tests/sql/run-session-tests.py
"""
import os
from pathlib import Path
import selectors
import subprocess

ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('PGHOST') not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('PGHOST must be an explicit loopback address; production is forbidden.')
if not os.environ.get('PGDATABASE', '').startswith('estoque_rpc_test'):
    raise SystemExit('PGDATABASE must start with estoque_rpc_test and be disposable.')

PSQL = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']


def sql(statement, expected_error=None):
    result = subprocess.run(PSQL, input=statement, text=True, capture_output=True, timeout=30)
    if expected_error:
        assert result.returncode != 0 and expected_error in result.stderr, result.stderr
    elif result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def file(path):
    return sql((ROOT / path).read_text())


assert sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'") == '0', 'Database must be empty'
sql("create role anon nologin; create role authenticated nologin; create schema extensions;")
file('db/schema.sql')
migration = next(ROOT.glob('supabase/migrations/*_inventory_validate_session.sql'))
file(migration)
file('tests/sql/inventory-validate-session.sql')
print('PASS SQL session states, API roles, ACL/RLS, exact output, no stock dependency', flush=True)

UID = '00000000-0000-4000-8000-000000000009'
sql(f"""insert into private.app_users(id,username,password_hash,role,display_name)
values ('{UID}','concurrent_test','not-a-credential','employee','Test');
insert into private.app_sessions(token_hash,user_id,expires_at)
values (encode(extensions.digest(repeat('9',64),'sha256'),'hex'),'{UID}',now()+interval '1 hour');""")
VALIDATE = "set role anon; select public.inventory_validate_session(repeat('9',64))->>'valid';"


def concurrent_change(change, commit=True):
    """Hold an uncommitted writer open while a separate connection validates."""
    writer = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True)
    try:
        writer.stdin.write('begin;\n' + change + '\n\\echo WRITER_READY\n')
        writer.stdin.flush()
        with selectors.DefaultSelector() as selector:
            selector.register(writer.stdout, selectors.EVENT_READ)
            assert selector.select(timeout=10), 'Writer did not reach barrier'
            assert writer.stdout.readline().strip() == 'WRITER_READY'
        # Validation must neither block on the writer nor observe dirty data.
        assert sql("set statement_timeout='2s'; " + VALIDATE) == 'true'
        writer.stdin.write(('commit' if commit else 'rollback') + ';\n\\q\n')
        writer.stdin.flush()
        _, error = writer.communicate(timeout=10)
        assert writer.returncode == 0, error
    finally:
        if writer.poll() is None:
            writer.kill()
            writer.communicate()


revoke = "update private.app_sessions set revoked_at=now() where user_id='" + UID + "';"
concurrent_change(revoke, commit=False)
assert sql(VALIDATE) == 'true'
concurrent_change(revoke)
sql(VALIDATE, 'Sessão inválida ou expirada.')
sql(f"update private.app_sessions set revoked_at=null where user_id='{UID}';")
concurrent_change(f"update private.app_users set active=false where id='{UID}';")
sql(VALIDATE, 'Sessão inválida ou expirada.')
sql(f"update private.app_users set active=true where id='{UID}';")
concurrent_change(f"update private.app_users set role='admin' where id='{UID}';")
assert sql("set role anon; select public.inventory_validate_session(repeat('9',64))#>>'{user,role}';") == 'admin'
print('PASS concurrent revocation, rollback, deactivation and role change', flush=True)

# Expiry is evaluated at each request, not at the start of a long transaction.
sql(f"""begin;
update private.app_sessions set expires_at=clock_timestamp()+interval '50 milliseconds' where user_id='{UID}';
select pg_sleep(0.1);
set local role anon;
select public.inventory_validate_session(repeat('9',64));""", 'Sessão inválida ou expirada.')
print('PASS expiry during long transaction', flush=True)

file('db/rollback/inventory_validate_session.sql')
assert sql("select to_regprocedure('public.inventory_validate_session(text)') is null") == 't'
assert sql("select to_regprocedure('private.inventory_validate_session_impl(text)') is null") == 't'
assert sql("set role anon; select public.inventory_get(repeat('9',64))#>>'{user,role}';") == 'admin'
file(migration)
file('tests/sql/inventory-validate-session.sql')
print('PASS rollback preserves inventory_get, users and sessions; reapply succeeds', flush=True)

# Insecure baselines must abort before installing either function.
file('db/rollback/inventory_validate_session.sql')
sql('grant select(token_hash) on private.app_sessions to anon;')
sql(migration.read_text(), 'Direct table/column privileges must be reviewed')
assert sql("select to_regprocedure('public.inventory_validate_session(text)') is null") == 't'
sql('revoke select(token_hash) on private.app_sessions from anon;')
sql('alter table private.app_sessions disable row level security;')
sql(migration.read_text(), 'RLS prerequisite missing')
sql('alter table private.app_sessions enable row level security;')
file(migration)
print('PASS unsafe baseline rejection is atomic', flush=True)
