#!/usr/bin/env python3
"""Run tenant cutover acceptance against an empty loopback PostgreSQL only."""
import os
from pathlib import Path
import subprocess
import re
import selectors
import time

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

# Exercise the view's underlying row locks with independent PostgreSQL connections.
# Fixed tokens below belong only to synthetic users in this disposable database.
tenant_a = '00000000-0000-4000-8000-0000000000e1'
tenant_b = '00000000-0000-4000-8000-0000000000e2'
sql(f"""
insert into private.establishments(id,name) values ('{tenant_a}','Concurrent A'),('{tenant_b}','Concurrent B');
insert into private.tenant_memberships(user_id,tenant_id,role)
 select u.id,e.id,'admin' from private.app_users u cross join private.establishments e
 where u.username='sql.manager' and e.id in ('{tenant_a}','{tenant_b}');
insert into private.tenant_inventory(tenant_id,id,state)
 values ('{tenant_a}',true,'{{"products":[],"documents":[],"movements":[],"revision":0}}'),
 ('{tenant_b}',true,'{{"products":[],"documents":[],"movements":[],"revision":0}}');
insert into private.app_sessions(token_hash,user_id,expires_at,tenant_id)
 select encode(extensions.digest(repeat(v.token,64),'sha256'),'hex'),u.id,now()+interval '1 hour',v.tenant_id::uuid
 from private.app_users u cross join (values ('c','{tenant_a}'),('d','{tenant_b}')) v(token,tenant_id)
 where u.username='sql.manager';
""")
psql = ['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']

def save_statement(token, revision, marker):
    return ("select public.inventory_save(repeat('%s',64),"
            "jsonb_build_object('products','[]'::jsonb,'documents','[]'::jsonb,"
            "'movements','[]'::jsonb,'revision',%s,'concurrencyMarker','%s'));"
            % (token, revision, marker))

def open_writer(statement):
    process = subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE,text=True,bufsize=1)
    process.stdin.write("begin; set statement_timeout='8s'; set local role anon;\n"
                        + statement + "\n\\echo TENANT_WRITER_READY\n")
    process.stdin.flush()
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        assert selector.select(timeout=8), 'Tenant writer barrier timed out'
        for _ in range(8):
            line = process.stdout.readline().strip()
            if line == 'TENANT_WRITER_READY':
                return process
    process.kill()
    raise AssertionError('Tenant writer failed before barrier')

def commit_writer(process):
    _, stderr = process.communicate('commit;\n',timeout=10)
    assert process.returncode == 0, stderr

writer = open_writer(save_statement('c',0,'first-writer'))
waiter = subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE,text=True)
try:
    waiter.stdin.write("begin; set statement_timeout='8s'; set local role anon;\n"
                       + save_statement('c',0,'stale-writer') + '\ncommit;\n')
    waiter.stdin.flush()
    time.sleep(0.25)
    assert waiter.poll() is None, 'Same-tenant writer did not wait for the row lock'
    commit_writer(writer)
    _, stderr = waiter.communicate(timeout=10)
    assert waiter.returncode != 0 and '40001' in stderr, 'Stale same-tenant revision was not rejected'
finally:
    for process in (writer,waiter):
        if process.poll() is None:
            process.kill()
assert sql(f"select state->>'concurrencyMarker' from private.tenant_inventory where tenant_id='{tenant_a}'") == 'first-writer'
assert sql(f"select state->>'revision' from private.tenant_inventory where tenant_id='{tenant_a}'") == '1'
print('PASS concurrent same-tenant saves serialize; exactly one revision succeeds')

# Give both tenants revision 1. B must finish while A still holds its own lock.
sql("set role anon; " + save_statement('d',0,'prepare-second-tenant'))
writer = open_writer(save_statement('c',1,'independent-a'))
try:
    independent = subprocess.run(psql,input="begin; set statement_timeout='3s'; set local role anon;\n"
                                 + save_statement('d',1,'independent-b') + '\ncommit;\n',
                                 text=True,capture_output=True,timeout=6)
    assert independent.returncode == 0, independent.stderr
    commit_writer(writer)
finally:
    if writer.poll() is None:
        writer.kill()
assert sql(f"select count(*) from private.tenant_inventory where tenant_id in ('{tenant_a}','{tenant_b}') and state->>'revision'='2'") == '2'
print('PASS concurrent different-tenant saves with equal revisions finish independently')
print('PASS tenant cutover, isolation, privileges, password gate, token rotation and fiscal/cash flows')
