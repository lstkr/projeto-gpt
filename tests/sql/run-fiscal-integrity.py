#!/usr/bin/env python3
"""Run P0 fiscal SQL and concurrent posting tests on a disposable LOCAL Postgres."""
import os
from pathlib import Path
import selectors
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Only loopback PGHOST allowed: never run fiscal tests against production.')
if not os.environ.get('PGDATABASE', '').startswith('estoque_rpc_test'):
    raise SystemExit('PGDATABASE must begin estoque_rpc_test (disposable only).')
PSQL = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']


def sql(statement, error=None):
    run = subprocess.run(PSQL, input=statement, text=True, capture_output=True, timeout=20)
    if error:
        assert run.returncode != 0 and error in run.stderr, run.stderr
    elif run.returncode:
        raise AssertionError(run.stderr)
    return run.stdout.strip()


def file(name):
    return sql((ROOT / name).read_text())


assert sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'") == '0', 'Database is not empty'
sql('create role anon nologin; create role authenticated nologin; create schema extensions;')
file('supabase/migrations/20261019000000_legacy_baseline.sql')
migration = ROOT / 'supabase/migrations/20261020221500_fiscal_write_integrity.sql'
sql(migration.read_text())
file('tests/sql/fiscal-write-integrity.sql')
print('PASS fiscal ACL, null revision, atomic posting, cancellation and idempotent marker', flush=True)

TOKEN = "repeat('a',64)"
A = '00000000-0000-4000-8000-0000000000c1'
C = '00000000-0000-4000-8000-0000000000c3'
D = '00000000-0000-4000-8000-0000000000c4'
E = '00000000-0000-4000-8000-0000000000c5'


def snapshot(documents, revision):
    docs = ','.join(
        "jsonb_build_object('id','%s','pendingReceiptId','%s')" % (doc, pending)
        for doc, pending in documents
    )
    return ("jsonb_build_object('products','[]'::jsonb,'movements','[]'::jsonb,"
            "'documents',jsonb_build_array(%s),'revision',%s)" % (docs, revision))


def posting(documents, revision):
    return "set local role anon; select public.inventory_save(%s,%s);" % (TOKEN, snapshot(documents, revision))


def cancel(pending):
    return "set local role anon; select public.pending_receipt_cancel(%s,'%s');" % (TOKEN, pending)


def begin_writer(statement):
    process = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, bufsize=1)
    process.stdin.write("begin;\nset statement_timeout='8s';\n" + statement + "\n\\echo WRITER_READY\n")
    process.stdin.flush()
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        assert selector.select(timeout=8), 'Transaction barrier timed out'
        lines = []
        while True:
            line = process.stdout.readline().strip()
            lines.append(line)
            if line == 'WRITER_READY':
                break
            assert len(lines) < 12, ('unexpected SQL error', lines)
    return process


def finish_writer(process, commit=True):
    process.stdin.write(('commit' if commit else 'rollback') + ';\n\\q\n')
    process.stdin.flush()
    _, stderr = process.communicate(timeout=12)
    assert process.returncode == 0, stderr


def waiter(statement):
    return subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)


def finish_waiter(process, statement, expected_error=None):
    stdout, stderr = process.communicate("set statement_timeout='8s';\nbegin;\n"
                                         + statement + "\ncommit;\n", timeout=12)
    if expected_error:
        assert process.returncode != 0 and expected_error in stderr, (stdout, stderr)
    else:
        assert process.returncode == 0, stderr
    return stdout


# Case 1: posting locks inventory first; cancellation waits, then sees posted.
first = [('initial-doc', A)]
post_c = posting(first + [('concurrent-doc', C)], 1)
writer = begin_writer(post_c)
try:
    blocked = waiter(cancel(C))
    # waiter() is launched but receives its statement on communicate. Feed before barrier.
    blocked.stdin.write("set statement_timeout='8s';\nbegin;\n" + cancel(C) + "\ncommit;\n")
    blocked.stdin.flush()
    time.sleep(0.25)
    assert blocked.poll() is None, 'cancel did not wait for the posting transaction'
    finish_writer(writer)
    _, err = blocked.communicate(timeout=12)
    assert blocked.returncode != 0 and 'Nota não está mais pendente' in err, err
finally:
    if writer.poll() is None:
        writer.kill()
        writer.communicate()
assert sql("select state from public.pending_receipts where id='%s'" % C) == 'posted'
assert sql("select state->>'revision' from public.shared_inventory where id=true") == '2'
print('PASS concurrent posting wins; cancel blocked and rejected', flush=True)

# Case 2: cancellation holds inventory first; posting waits and sees cancelled.
writer = begin_writer(cancel(D))
try:
    blocked = waiter(posting(first + [('concurrent-doc', C), ('cancelled-race-doc', D)], 2))
    blocked.stdin.write("set statement_timeout='8s';\nbegin;\n"
                        + posting(first + [('concurrent-doc', C), ('cancelled-race-doc', D)], 2) + "\ncommit;\n")
    blocked.stdin.flush()
    time.sleep(0.25)
    assert blocked.poll() is None, 'posting did not wait for cancellation lock'
    finish_writer(writer)
    _, err = blocked.communicate(timeout=12)
    assert blocked.returncode != 0 and 'Nota cancelada, lançada ou inexistente' in err, err
finally:
    if writer.poll() is None:
        writer.kill()
        writer.communicate()
assert sql("select state from public.pending_receipts where id='%s'" % D) == 'cancelled'
assert sql("select state->>'revision' from public.shared_inventory where id=true") == '2'
print('PASS concurrent cancellation wins; posting blocked and rolled back', flush=True)

# Case 3: stale revision after concurrent commit cannot duplicate stock/document.
sql(posting(first + [('concurrent-doc', C), ('unique-doc', E)], 2))
sql(posting(first + [('concurrent-doc', C), ('retry-doc', E)], 2), 'O estoque foi alterado em outra sessão')
assert sql("select count(*) from jsonb_array_elements((select state->'documents' from public.shared_inventory where id=true)) x where x->>'pendingReceiptId'='%s'" % E) == '1'
print('PASS retries and stale revisions cannot duplicate documents', flush=True)

# Emergency rollback is reversible at code level; fixture documents survive.
file('db/rollback/fiscal_write_integrity.sql')
assert 'incoming_revision is null' not in sql(
    "select pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure)")
sql(migration.read_text())
assert 'incoming_revision is null' in sql(
    "select pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure)")
assert sql("select state->>'revision' from public.shared_inventory where id=true") == '3'
print('PASS reversible function migration, data retained, reapplication succeeds', flush=True)
