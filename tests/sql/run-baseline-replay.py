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
sql((ROOT / 'tests/sql/baseline-security.sql').read_text(encoding='utf8'))
print('PASS grants, SECURITY DEFINER, search_path, RLS and negative role/session checks')
contract = subprocess.run(['node', 'scripts/check-rpc-contract.cjs', '--emit-sql'],
                          cwd=ROOT, text=True, capture_output=True, check=True)
sql(contract.stdout)
print('PASS frontend RPC catalog contract')
sql((ROOT / 'tests/sql/tenant-access.sql').read_text(encoding='utf8'))
sql((ROOT / 'tests/sql/user-directory-update.sql').read_text(encoding='utf8'))
print('PASS tenant and user-directory acceptance after migrations-only replay')
