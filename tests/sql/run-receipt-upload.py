"""Valida recebimento em PostgreSQL vazio e descartável; nunca aceita host remoto."""
import json
import os
from pathlib import Path
import subprocess
import time

from process_barrier import wait_for_marker

ROOT = Path(__file__).resolve().parents[2]
DATABASE = os.environ.get('PGDATABASE', '')
if os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Somente PGHOST loopback é permitido.')
if not DATABASE.startswith('estoque_rpc_test'):
    raise SystemExit('Use banco descartável estoque_rpc_test*.')
PSQL = json.loads(os.environ.get('ESTOQUE_TEST_PSQL_PREFIX_JSON', '["psql"]')) + [
    '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
    '-U', 'postgres', '-d', DATABASE]
TENANT_A = '00000000-0000-4000-8000-000000000001'
TENANT_B = '00000000-0000-4000-8000-000000000002'
CHECKS = []


def sql(statement, expected_state=None):
    """Executa SQL sintético e verifica o SQLSTATE sem imprimir parâmetros."""
    result = subprocess.run(PSQL, input=statement, text=True, capture_output=True, timeout=45)
    if expected_state:
        assert result.returncode != 0 and expected_state in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def check(name, condition):
    """Registra somente o resultado do cenário, sem dados fiscais."""
    assert condition, name
    CHECKS.append(name)
    print('PASS', name)


def receive(token='a', content='foto-sintetica', drafts=None, **metadata):
    """Monta chamada com arquivo e identidades deliberadamente sintéticos."""
    file_metadata = {'fileName': 'fixture.jpeg', 'mime': 'image/jpeg', 'channel': 'celular', **metadata}
    draft_list = drafts if drafts is not None else [{'source': 'OCR', 'checkedBy': 'Não é remetente'}, {'source': 'OCR'}]
    return (f"select public.pending_receipt_receive(repeat('{token}',64),"
            f"'{json.dumps(file_metadata)}'::jsonb || jsonb_build_object('base64',"
            f"encode(convert_to('{content}','UTF8'),'base64')),'{json.dumps(draft_list)}'::jsonb);")


def received(**options):
    """Chama a API com o papel de acesso do navegador."""
    return json.loads(sql('set role anon; ' + receive(**options)))


def install_fixture():
    """Reproduz a base real e todas as migrações somente em banco vazio."""
    assert sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'") == '0'
    sql((ROOT / 'tests/sql/disposable-supabase-setup.sql').read_text(encoding='utf8'))
    plan = json.loads((ROOT / 'scripts/admin/clean-install-plan.json').read_text(encoding='utf8'))
    for file in plan['base']:
        sql((ROOT / file).read_text(encoding='utf8'))
    for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        sql(migration.read_text(encoding='utf8'))
    sql((ROOT / 'tests/sql/receipt-upload-fixture.sql').read_text(encoding='utf8'))


def wait_for_lock():
    """Espera evidência do bloqueio real, sem depender de uma pausa fixa."""
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql("select count(*) from pg_stat_activity where application_name='receipt_waiter' and wait_event_type='Lock'") == '1':
            return
        time.sleep(0.05)
    raise AssertionError('A segunda conexão não aguardou o índice único.')


def concurrent_retry():
    """Descarta a resposta do vencedor e repete a chamada em outra conexão."""
    writer = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    waiter = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        writer.stdin.write('begin; set local role anon; ' + receive(content='corrida') + '\n\\echo UPLOAD_READY\n')
        writer.stdin.flush()
        wait_for_marker(writer, 'UPLOAD_READY', 10, 'Primeiro recebimento não alcançou a barreira.')
        waiter.stdin.write("set application_name='receipt_waiter'; set statement_timeout='15s'; set role anon; " + receive(content='corrida') + '\n')
        waiter.stdin.flush()
        wait_for_lock()
        writer.communicate('commit;\n', timeout=10)
        assert writer.returncode == 0
        response, errors = waiter.communicate(timeout=10)
        assert waiter.returncode == 0, errors
        duplicate = json.loads(response.strip())
        retry = received(content='corrida')
        check('concorrência e resposta perdida devolvem os mesmos IDs', duplicate == retry and retry['reused'])
        check('dois cupons da foto permanecem distintos', len({row['id'] for row in retry['receipts']}) == 2)
    finally:
        for process in (writer, waiter):
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)


install_fixture()
stock_before = sql("select md5(string_agg(state::text,'' order by tenant_id)) from private.tenant_inventory")
first = received(ownerId='forjado', submittedAt='1900-01-01')
check('autoria e horário vêm da sessão/servidor', first['submittedBy']['displayName'] == 'Remetente sintético' and first['submittedAt'][:4] != '1900')
check('hash SHA-256 calculado dos bytes', sql("select file_sha256=extensions.digest(convert_to('foto-sintetica','UTF8'),'sha256') from private.receipt_uploads") == 't')
check('original e proveniência fiscal preservados', sql("select count(*) from private.pending_receipts where file_bytes=convert_to('foto-sintetica','UTF8') and draft->>'source'='OCR'") == '2')
check('resposta mínima sem bytes ou hash', 'base64' not in first and 'sha256' not in first and 'file_bytes' not in first)
retry = received(token='c', drafts=[{'source': 'XML', 'checkedBy': 'Outra pessoa'}], channel='desktop')
check('retentativa preserva IDs/autoria/canal e não substitui rascunhos', retry == {**first, 'reused': True})
receipt_id = first['receipts'][0]['id']
sql(f"set role anon; select public.pending_receipt_save(repeat('a',64),'{receipt_id}','{{\"source\":\"OCR revisado\"}}',1);")
retry = received()
check('retentativa não desfaz conferência concorrente', retry['receipts'][0]['revision'] == 2 and sql(f"select draft->>'source' from private.pending_receipts where id='{receipt_id}'") == 'OCR revisado')
other_unit = received(token='b')
check('mesmo arquivo em outra unidade tem identidade independente', other_unit['uploadId'] != first['uploadId'])
submissions = json.loads(sql("set role anon; select public.pending_receipt_submissions(repeat('a',64));"))
check('lista de autoria filtra a unidade', len(submissions) == 2 and all(row['channel'] == 'celular' for row in submissions))
for token, state in [('d', '28000'), ('e', '28000'), ('f', '42501'), ('0', '28000')]:
    sql('set role anon; ' + receive(token=token), state)
check('sessão revogada/inativa/ausente e permissão negada são recusadas', True)
sql("set role anon; select public.pending_receipt_submissions(repeat('f',64));", '42501')
sql('set role anon; select * from private.receipt_uploads;', '42501')
sql("set role anon; select private.receipt_upload_result(null,false);", '42501')
check('leitura negada e acesso direto/helper bloqueados', True)
for options in [dict(sha256='0'*64), dict(channel='OCR'), dict(drafts=[]), dict(drafts=[{}, None])]:
    sql('set role anon; ' + receive(**options), '22023')
check('hash informado é verificado e lote/metadados inválidos são recusados', True)
sql('begin; set local role anon; ' + receive(content='abortado') + 'rollback;')
check('rollback não deixa arquivo nem cupons parciais', sql("select count(*) from private.receipt_uploads where file_sha256=extensions.digest('abortado','sha256')") == '0')
concurrent_retry()
legacy = json.loads(sql("set role anon; select public.pending_receipt_create(repeat('a',64),'legacy.xml','text/xml','eA==','{}');"))
listed = json.loads(sql("set role anon; select public.pending_receipt_submissions(repeat('a',64));"))
check('RPC legado compatível e canal legado desconhecido', legacy['ok'] and next(row for row in listed if row['id'] == legacy['id'])['channel'] is None)
sql(f"update private.pending_receipts set state='cancelled' where upload_id='{first['uploadId']}';")
check('reenvio não ressuscita notas canceladas', all(row['state'] == 'cancelled' for row in received()['receipts']))
sql(f"delete from private.pending_receipts where upload_id='{first['uploadId']}';")
sql('set role anon; ' + receive(), '55000')
check('arquivo removido por manutenção não produz sucesso vazio', True)
check('recebimento não movimenta estoque', stock_before == sql("select md5(string_agg(state::text,'' order by tenant_id)) from private.tenant_inventory"))
check('nenhuma função nova com EXECUTE público', sql("select count(*) from pg_proc where proname in ('pending_receipt_receive','pending_receipt_submissions','require_receipt_actor','decode_receipt_upload','receipt_upload_result') and has_function_privilege('public',oid,'EXECUTE')") == '0')
print(f'{len(CHECKS)} cenários aprovados; nenhuma conexão remota.')
