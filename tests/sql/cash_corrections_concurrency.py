"""B1: duas conexões reais e reversão operacional em banco descartável do runner."""
import json
import subprocess
import time
from pathlib import Path
from process_barrier import wait_for_marker


def run(sql, command, root):
    fixture = (root/'tests/sql/cash-corrections.sql').read_text(encoding='utf8')
    sql("insert into private.establishments(id,name) values('00000000-0000-4000-8000-000000000001','B1 Fixture') on conflict do nothing")
    sql(fixture.split('set local role anon;')[0].replace('begin;', ''))
    entry = dict(day='2026-11-01', register='b1.concurrent', operator='Fixture', cashCounted='0.30', movements=[])
    saved = json.loads(sql(call(entry)))
    entry.update(id=saved['id'], expectedRevision='0', correctionReason='Concorrência sintética',
                 requestId='00000000-0000-4000-8000-0000000000c1')
    race(sql, command, (entry, entry), replay=True)
    assert json.loads(sql(call(entry)))['replayed'] is True
    entry.update(expectedRevision='1', requestId='00000000-0000-4000-8000-0000000000c2', cashCounted='0.20')
    stale = dict(entry, requestId='00000000-0000-4000-8000-0000000000c3', cashCounted='0.10')
    race(sql, command, (entry, stale), replay=False)
    assert sql(f"select revision from private.cash_closings where id='{saved['id']}'") == '2'
    assert sql('select count(*) from private.cash_closing_audit') == '2'
    before = sql('select md5(string_agg(to_jsonb(a)::text, chr(10) order by id)) from private.cash_closing_audit a')
    values_before = sql(f"select to_jsonb(c)::text from private.cash_closings c where id='{saved['id']}'")
    sql((root/'db/rollback/cash_closing_corrections.sql').read_text(encoding='utf8'))
    error(sql, call(dict(entry, expectedRevision='2')), 'suspensas')
    assert sql('select md5(string_agg(to_jsonb(a)::text, chr(10) order by id)) from private.cash_closing_audit a') == before
    assert sql(f"select to_jsonb(c)::text from private.cash_closings c where id='{saved['id']}'") == values_before
    assert len(json.loads(sql(f"select public.cash_closing_audit_list('b1.manager','{saved['id']}')"))) == 2
    assert json.loads(sql(call(dict(day=entry['day'], register='b1.after.rollback', operator='Fixture', cashCounted='0', movements=[]))))['ok']
    error(sql, call(dict(day=entry['day'], register=entry['register'], operator='Fixture', cashCounted='0', movements=[])), 'Já existe')
    print('PASS B1 concurrent replay, stale session, rollback preserves values/audit and creation')
    verify_full_reset(sql, root)


def verify_full_reset(sql, root):
    reset = (root/'db/operations/reset-test-environment.sql').read_text(encoding='utf8')
    before = sql('select count(*) from private.app_users')
    error(sql, reset, 'Confirmação explícita')
    assert sql('select count(*) from private.app_users') == before
    assert sql('select count(*) from private.cash_closing_audit') == '2'
    confirmation = "set estoque.confirm_full_reset='APAGAR TODAS AS CONTAS E HISTORICO DA HOMOLOGACAO';"
    error(sql, 'set role anon; '+confirmation+reset, 'reservado ao proprietário')
    assert sql('select count(*) from private.cash_closing_audit') == '2'
    sql(confirmation+reset)
    for table in ['cash_closing_audit', 'cash_closings', 'app_users', 'app_sessions', 'establishments']:
        assert sql(f'select count(*) from private.{table}') == '0', table
    print('PASS deliberate full reset refuses missing confirmation/app role; removes two audit rows and accounts')


def call(entry):
    payload = json.dumps(entry, ensure_ascii=False).replace("'", "''")
    return f"set role anon; select public.cash_closing_save('b1.manager','{payload}'::jsonb);"


def error(sql, statement, expected):
    try:
        sql(statement)
    except AssertionError as failure:
        assert expected in str(failure), str(failure)
    else:
        raise AssertionError('Esperava recusa: '+expected)


# Mantém as duas conexões e sua limpeza juntas (até 50 linhas) para evitar transação aberta.
def race(sql, command, attempts, replay):
    winner, waiter_entry = attempts
    holder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding='utf8')
    waiter = None
    try:
        holder.stdin.write('begin; '+call(winner)+chr(10)+chr(92)+'echo B1_LOCKED'+chr(10))
        holder.stdin.flush()
        wait_for_marker(holder, 'B1_LOCKED', 10, 'Correção não obteve lock')
        waiter = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, encoding='utf8')
        waiter.stdin.write("set application_name='b1.waiter'; "+call(waiter_entry)+'\n')
        waiter.stdin.close()
        deadline = time.monotonic()+5
        while sql("select count(*) from pg_stat_activity where application_name='b1.waiter' and wait_event_type='Lock'") != '1':
            assert waiter.poll() is None and time.monotonic()<deadline, 'Segunda sessão não esperou o lock'
            time.sleep(0.05)
        holder.stdin.write('commit;'+chr(10)+chr(92)+'q'+chr(10)); holder.stdin.flush()
        holder.wait(timeout=10)
        waiter.wait(timeout=10)
        output, failure = waiter.stdout.read(), waiter.stderr.read()
        if replay:
            assert waiter.returncode == 0 and '"replayed": true' in output, failure
        else:
            assert waiter.returncode != 0 and 'outra sessão' in failure, failure
    finally:
        for process in [holder, waiter]:
            if process is not None and process.poll() is None:
                process.kill(); process.wait(timeout=5)
