"""E1: conexões independentes, rejeição atômica e reversão sem remover dados."""
import json
import subprocess
import time
from process_barrier import wait_for_marker


def call(token, revision, document_id):
    state = dict(products=[dict(id='e1.p', stock=2)], movements=[], revision=revision,
                 documents=[dict(id=document_id, accessKey='3'*44)])
    return "select public.inventory_save('%s','%s'::jsonb);" % (token, json.dumps(state))


# Sequência de 45 linhas mantém a mesma fixture entre corrida e reversão para verificar preservação.
def run(sql, command, root):
    fixture = (root/'tests/sql/fiscal-access-key-uniqueness.sql').read_text(encoding='utf8')
    sql(fixture.split('set local role anon;')[0].replace('begin;', ''))
    command = command + ['-v', 'VERBOSITY=verbose']
    holder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, encoding='utf8')
    waiter = None
    try:
        holder.stdin.write("begin; set statement_timeout='8s'; set local role anon; " + call('e1.a', 0, 'race.first') + '\n\\echo E1_LOCKED\n')
        holder.stdin.flush()
        wait_for_marker(holder, 'E1_LOCKED', 8, 'E1 não obteve lock')
        waiter = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, encoding='utf8')
        waiter.stdin.write("set application_name='e1.waiter'; set statement_timeout='8s'; set role anon; " + call('e1.a', 0, 'race.second') + '\n')
        waiter.stdin.close()
        deadline = time.monotonic()+5
        while sql("select count(*) from pg_stat_activity where application_name='e1.waiter' and wait_event_type='Lock'") != '1':
            assert waiter.poll() is None and time.monotonic()<deadline, 'E1 não aguardou lock'
            time.sleep(0.05)
        holder.stdin.write('commit;\n\\q\n'); holder.stdin.flush(); holder.wait(timeout=10)
        waiter.wait(timeout=10)
        failure = waiter.stderr.read()
        assert holder.returncode == 0, holder.stderr.read()
        assert waiter.returncode != 0 and 'PT409' in failure, failure
    finally:
        for process in [holder, waiter]:
            if process is not None and process.poll() is None:
                process.kill(); process.wait(timeout=5)
    # Após reler a revisão atual, a chave continua bloqueada, mesmo omitindo a nota anterior.
    denied = subprocess.run(command, input="set role anon; "+call('e1.a', 1, 'race.second'),
                            text=True, capture_output=True, timeout=10)
    assert denied.returncode != 0 and '23505' in denied.stderr, denied.stderr
    assert sql("select count(*) from private.tenant_inventory, lateral jsonb_array_elements(state->'documents') doc where doc->>'accessKey'=repeat('3',44)") == '1'
    assert sql("select state->>'revision' from private.tenant_inventory where tenant_id='00000000-0000-4000-8000-0000000000f1'") == '1'
    before = sql("select md5(string_agg(to_jsonb(r)::text,'' order by tenant_id)) from private.tenant_inventory r")
    users = sql("select md5(string_agg(to_jsonb(r)::text,'' order by id)) from private.app_users r")
    sql((root/'db/rollback/fiscal_access_key_uniqueness.sql').read_text(encoding='utf8'))
    assert sql("select md5(string_agg(to_jsonb(r)::text,'' order by tenant_id)) from private.tenant_inventory r") == before
    denied = subprocess.run(command, input="set role anon; "+call('e1.a', 1, 'rollback.new'),
                            text=True, capture_output=True, timeout=10)
    assert denied.returncode != 0 and '55000' in denied.stderr, denied.stderr
    assert sql("select md5(string_agg(to_jsonb(r)::text,'' order by tenant_id)) from private.tenant_inventory r") == before
    assert sql("select md5(string_agg(to_jsonb(r)::text,'' order by id)) from private.app_users r") == users
    sql("set role anon; select public.inventory_save('e1.a',public.inventory_get('e1.a')||'{\"unrelated\":\"allowed\"}'::jsonb)")
    print('PASS E1 concurrent key blocked before writes; rollback preserves inventory/users and allows ordinary save')
