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
sql("create schema auth; create table auth.users(id uuid primary key); "
    "insert into auth.users values ('00000000-0000-4000-8000-0000000000a1'); "
    "create schema storage; create table storage.buckets(id text primary key); "
    "create table storage.objects(id uuid primary key); "
    "insert into storage.buckets values ('fixture-bucket'); "
    "insert into storage.objects values ('00000000-0000-4000-8000-0000000000a2')")
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
    if migration.name == '20261023013000_fiscal_document_server_attribution.sql':
        migration_text = migration.read_text(encoding='utf8')
        fault = migration_text.rsplit('commit;', 1)[0] + "do $$ begin raise exception 'injected attribution failure'; end $$; commit;"
        run = subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1'],input=fault,text=True,capture_output=True,timeout=90)
        assert run.returncode != 0 and 'injected attribution failure' in run.stderr
        assert sql("select to_regclass('private.fiscal_document_attribution') is null") == 't'
        definition = sql("select pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure)")
        assert 'checkedByVerified' not in definition and 'active_tenant' not in definition
        print('PASS failed fiscal-attribution migration rolls back table and RPC patch')
    sql(migration.read_text(encoding='utf8'))
sql((ROOT/'tests/sql/tenant-access.sql').read_text(encoding='utf8'))
sql((ROOT/'tests/sql/user-directory-update.sql').read_text(encoding='utf8'))
sql((ROOT/'tests/sql/revocation-contract.sql').read_text(encoding='utf8'))
sql((ROOT/'tests/sql/cash-report-batch.sql').read_text(encoding='utf8'))

# Exercise fiscal-attribution rollback without removing its audit records.
# The tenant fixture now creates three attributed documents; compare to the
# actual pre-rollback snapshot rather than assuming a fixed row count.
# The rollback runs in a transaction that is deliberately reverted afterwards.
audit_snapshot_query = ("select coalesce(md5(string_agg(to_jsonb(r)::text,'' "
                        "order by tenant_id, document_id)),'') "
                        "from private.fiscal_document_attribution r")
audit_snapshot_before = sql(audit_snapshot_query)
audit_count_before = sql("select count(*) from private.fiscal_document_attribution")
assert audit_count_before.isdigit() and int(audit_count_before)>=2
rollback_sql = (ROOT/'supabase/rollback/20261023013000_fiscal_document_server_attribution.sql').read_text(encoding='utf8')
sql("begin;\\n" + rollback_sql + "\\ndo $check$ declare audit_count bigint; marker_position integer; begin "
    "select count(*) into audit_count from private.fiscal_document_attribution; "
    "select position('The JSON snapshot stays backward compatible' in "
    "pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure)) "
    "into marker_position; "
    f"if audit_count<>{audit_count_before} then raise exception 'Rollback audit count changed from {audit_count_before} to %', audit_count; end if; "
    "if marker_position<>0 then raise exception 'Rollback attribution marker still present at %', marker_position; end if; "
    "end $check$;\\nrollback;")
assert sql(audit_snapshot_query) == audit_snapshot_before, 'Fiscal attribution rollback changed audit records'
assert sql("select position('The JSON snapshot stays backward compatible' in pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure)) > 0") == 't'
print('PASS fiscal attribution rollback restores RPC and preserves audit rows')
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

# Revocation concurrency: an in-flight authorized RPC holds a session lock
# until its transaction ends; the manager deactivation cannot commit before it.
# This exercises actual SQL row locking across independent PG connections.
sql("""
insert into private.app_users(username,password_hash,role,display_name)
values ('qa.revocation',extensions.crypt('synthetic-revocation-only',
 extensions.gen_salt('bf',4)),'employee','Revocation QA');
insert into private.tenant_memberships(user_id,tenant_id,role)
 select id,'00000000-0000-4000-8000-000000000001','employee'
 from private.app_users where username='qa.revocation';
""")
worker_token=sql("select public.inventory_login('qa.revocation','synthetic-revocation-only')->>'session_token'")
# A separate browser/device must have an independently revocable session.
worker_token_two=sql("select public.inventory_login('qa.revocation','synthetic-revocation-only')->>'session_token'")
manager_token=sql("select public.inventory_login('qa.manager','synthetic-manager-password')->>'session_token'")
target_id=sql("select id from private.app_users where username='qa.revocation'")
assert len(worker_token)==64 and len(worker_token_two)==64 and len(manager_token)==64
assert worker_token!=worker_token_two, 'Separate logins must issue distinct tokens'
for token in [worker_token, worker_token_two]:
    assert sql("select (public.inventory_validate_session('%s')->>'valid')::text"%token)=='true'
baseline=sql("select state->>'revision' from private.tenant_inventory where tenant_id='00000000-0000-4000-8000-000000000001'")
# Preserve the exact synthetic inventory contents while exercising a real
# in-flight mutation; no blind clearing of stock/documents in the test.
baseline_state=sql("select state::text from private.tenant_inventory where tenant_id='00000000-0000-4000-8000-000000000001'")
assert baseline is not None and baseline.isdigit() and baseline_state
safe_state=baseline_state.replace("'", "''")
inflight=open_writer("select public.inventory_save('%s','%s'::jsonb);"%(worker_token,safe_state))
# Both independent tokens hold transaction-scoped session locks.
inflight_second=open_writer("select (public.inventory_validate_session('%s')->>'valid')::boolean;"%worker_token_two)
stopper=subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE,text=True)
try:
    stopper.stdin.write("begin; set statement_timeout='8s'; set local role anon;\n"
      "select public.inventory_user_update('%s','%s','qa.revocation','Revocation QA',false);\ncommit;\n"
      %(manager_token,target_id))
    stopper.stdin.flush()
    time.sleep(0.3)
    assert stopper.poll() is None, 'Deactivation incorrectly completed while RPC transaction held session'
    assert sql("select active from private.app_users where id='%s'"%target_id)=='t', \
      'Account deactivated before earlier authorized RPC committed'
    commit_writer(inflight)
    # A protected write committed BEFORE deactivation is allowed; its revision
    # must be durable while the other session still holds its transaction lock.
    assert sql("select state->>'revision' from private.tenant_inventory where tenant_id='00000000-0000-4000-8000-000000000001'")==str(int(baseline)+1), 'In-flight authorized save did not commit before account inactivation'
    time.sleep(0.15)
    assert stopper.poll() is None, 'Deactivation committed while the second token held an authorized RPC'
    commit_writer(inflight_second)
    _,stop_error=stopper.communicate(timeout=10)
    assert stopper.returncode==0,stop_error
finally:
    for proc in (inflight,inflight_second,stopper):
        if proc.poll() is None:
            proc.kill()
assert sql("select active from private.app_users where id='%s'"%target_id)=='f'
assert sql("select count(*) from private.app_sessions where user_id='%s' and revoked_at is null"%target_id)=='0'
for revoked_token in (worker_token,worker_token_two):
    for statement in [
        "select public.inventory_validate_session('%s');"%revoked_token,
        "select public.inventory_get('%s');"%revoked_token,
        ("select public.inventory_save('%s'," %revoked_token)+
           """'{"products":[],"documents":[],"movements":[],"revision":0}'::jsonb);""",
    ]:
        denied=subprocess.run(psql,input="set role anon;\n"+statement,text=True,capture_output=True,timeout=10)
        assert denied.returncode != 0 and ('28000' in denied.stderr or 'Sessão inválida' in denied.stderr), \
          'Revoked account accepted a protected operation: '+denied.stderr[:250]
assert sql("select state->>'revision' from private.tenant_inventory where tenant_id='00000000-0000-4000-8000-000000000001'")==str(int(baseline)+1), 'Revoked tokens changed the inventory after account inactivation'
print('PASS authorized in-flight save commits before deactivation, and revoked tokens cannot save after commit')
print('PASS deactivation waits for in-flight authorized RPC to finish')

# Race 2: login transaction must hold the account row lock until its newly
# created token is committed; deactivation then catches that token in its sweep.
sql("""
insert into private.app_users(username,password_hash,role,display_name)
 values ('qa.loginrace',extensions.crypt('synthetic-login-race-only',
 extensions.gen_salt('bf',4)),'employee','Login Race QA');
insert into private.tenant_memberships(user_id,tenant_id,role)
 select id,'00000000-0000-4000-8000-000000000001','employee'
 from private.app_users where username='qa.loginrace';
""")
login_target=sql("select id from private.app_users where username='qa.loginrace'")
login_tx=open_writer("select (public.inventory_login('qa.loginrace','synthetic-login-race-only')->>'ok')='true';")
deactivate=subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,text=True)
try:
    deactivate.stdin.write("begin; set statement_timeout='8s'; set local role anon;\n"
        "select public.inventory_user_update('%s','%s','qa.loginrace','Login Race QA',false);\ncommit;\n"
        %(manager_token,login_target))
    deactivate.stdin.flush()
    time.sleep(0.3)
    assert deactivate.poll() is None,'Deactivation raced past an in-flight login'
    commit_writer(login_tx)
    _,stderr=deactivate.communicate(timeout=10)
    assert deactivate.returncode==0,stderr
finally:
    for proc in (login_tx,deactivate):
        if proc.poll() is None:
            proc.kill()
assert sql("select count(*) from private.app_sessions where user_id='%s' and revoked_at is null"%login_target)=='0'
assert sql("select (public.inventory_login('qa.loginrace','synthetic-login-race-only')->>'ok')::text")=='false'
print('PASS login vs deactivation is serialized; no newly active orphan session')


# The authorized environment reset keeps Supabase-managed schemas outside its scope
# and leaves exactly one fresh DBA bootstrap path.
sql((ROOT/'db/operations/reset-test-environment.sql').read_text(encoding='utf8'))
for table in ['app_users','establishments','tenant_memberships','app_sessions','app_login_attempts',
              'tenant_inventory','cash_closings','pending_cash_reports','pending_receipts','user_permissions',
              'permission_audit','fiscal_document_attribution','external_fiscal_rate_limits']:
    assert sql(f'select count(*) from private.{table}') == '0', f'{table} reset'
assert sql("select count(*) from auth.users") == '1', 'managed auth data preserved'
assert sql("select count(*) from storage.buckets") == '1', 'managed storage buckets preserved'
assert sql("select count(*) from storage.objects") == '1', 'managed storage objects preserved'
sql("select private.bootstrap_superadmin('admin.master',replace(extensions.crypt('synthetic-fresh-dba',extensions.gen_salt('bf',12)),'$2a$','$2b$'))")
fresh = sql("with login as (select public.inventory_login('admin.master','synthetic-fresh-dba') result) "
            "select (result->>'must_change_password') || '|' || "
            "jsonb_array_length(public.inventory_tenants(result->>'session_token')->'tenants') from login")
assert fresh == 'true|0', f'fresh DBA first-login gate and empty directory: {fresh}'
for old_snapshot in ['estq_backup_app_users_20261021','estq_backup_app_sessions_20261021',
                      'estq_backup_shared_inventory_20261021','estq_backup_pending_receipts_20261021',
                      'estq_backup_function_defs_20261021']:
    assert sql(f"select to_regclass('private.{old_snapshot}') is null") == 't', f'{old_snapshot} removed'
print('PASS full test reset clears app data, retains Supabase-managed schemas, and allows fresh DBA bootstrap')
print('PASS tenant cutover, isolation, privileges, password gate, token rotation and fiscal/cash flows')

