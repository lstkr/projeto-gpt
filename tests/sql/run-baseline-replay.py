#!/usr/bin/env python3
"""Replay versioned migrations alone into a fresh loopback PostgreSQL database."""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Only loopback PGHOST allowed; never use a remote database.')
if not os.environ.get('PGDATABASE', '').startswith('estoque_rpc_test'):
    raise SystemExit('PGDATABASE must begin estoque_rpc_test (disposable only).')


def sql(statement):
    result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                            input=statement, text=True, capture_output=True, timeout=90)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


subprocess.run(['node', 'scripts/build-sql-baseline.cjs', '--check'], cwd=ROOT, check=True)
assert sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
           "where n.nspname in ('public','private') and c.relkind in ('r','p','v')") == '0', 'Database must be empty'
sql('create role anon nologin; create role authenticated nologin; create schema extensions;')
for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
    sql(migration.read_text(encoding='utf8'))
    print('PASS replay', migration.name, flush=True)
    if migration.name.endswith('_legacy_baseline.sql'):
        # Loading db bootstrap and then the same baseline is deliberately invalid.
        # Connection close rolls back this negative test; never run against real DBs.
        duplicate = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
            input='begin;\n' + migration.read_text(encoding='utf8') + '\nrollback;',
            text=True, capture_output=True, timeout=90)
        assert duplicate.returncode != 0 and 'already exists' in duplicate.stderr, 'Duplicate bootstrap must be rejected'
        print('PASS duplicate bootstrap rejected (existing inventory_login signature); negative transaction rolled back', flush=True)
catalog = sql("""
select coalesce(json_agg(row_to_json(a) order by a.signature), '[]'::json) from (
 select p.oid::regprocedure::text signature,
        coalesce(p.proconfig, array[]::text[]) settings,
        has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
        exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
               where x.grantee=0 and x.privilege_type='EXECUTE') public_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef
) a;
""")
print('SECURITY_DEFINER_CATALOG ' + catalog, flush=True)
sql((ROOT / 'tests/sql/baseline-security.sql').read_text(encoding='utf8'))
print('PASS grants, SECURITY DEFINER, search_path, RLS and negative role/session checks')
contract = subprocess.run(['node', 'scripts/check-rpc-contract.cjs', '--emit-sql'],
                          cwd=ROOT, text=True, capture_output=True, check=True)
sql(contract.stdout)
print('PASS frontend RPC catalog contract')
sql((ROOT / 'tests/sql/tenant-access.sql').read_text(encoding='utf8'))
sql((ROOT / 'tests/sql/user-directory-update.sql').read_text(encoding='utf8'))
print('PASS tenant and user-directory acceptance after migrations-only replay')
