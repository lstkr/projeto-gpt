#!/usr/bin/env python3
"""Apply the clean installation plan only to an explicitly confirmed empty database."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from clean_install_validation import validate_migration_prefix, validate_remote_target

ROOT = Path(__file__).resolve().parents[2]
PLAN = json.loads((ROOT / 'scripts/admin/clean-install-plan.json').read_text(encoding='utf8'))
def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-ref', required=True, help='Digite o ref autorizado do projeto Supabase.')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--preflight', action='store_true', help='Verifica destino e plano sem gravar no banco.')
    modes.add_argument('--resume', action='store_true', help='Retoma instalação parcial com fingerprint e ledger coerentes.')
    parser.add_argument('--local-disposable', action='store_true', help='Permite teste somente em loopback e banco estoque_rpc_test*.')
    return parser.parse_args()


def run_psql(command, database, env, sql=None, single_transaction=False):
    args = command + ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', env.get('PGUSER', 'postgres'), '-d', database]
    if sql is not None:
        args += ['--single-transaction', '-f', '-'] if single_transaction else ['-c', sql]
    result = subprocess.run(args, input=sql if single_transaction else None, text=True, encoding='utf8',
                            capture_output=True, env=env, timeout=300)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'psql falhou sem diagnóstico.')
    return result.stdout.strip()


def psql_prefix():
    raw = os.environ.get('ESTOQUE_INSTALL_PSQL_PREFIX_JSON')
    if not raw:
        return ['psql']
    prefix = json.loads(raw)
    if not isinstance(prefix, list) or not prefix or not all(isinstance(item, str) for item in prefix):
        raise ValueError('ESTOQUE_INSTALL_PSQL_PREFIX_JSON deve ser uma lista JSON de argumentos.')
    return prefix


def validate_target(args, allowed_ref):
    if not re.fullmatch(r'[a-z]{20}', allowed_ref) or args.confirm_ref != allowed_ref:
        raise ValueError('O ref confirmado não corresponde a ESTOQUE_SUPABASE_ALLOWED_REF.')
    if not args.local_disposable and allowed_ref != PLAN['supabaseRef']:
        raise ValueError('Instalação limpa só é permitida no projeto Estoque+ DB autorizado.')
    host = os.environ.get('PGHOST', '')
    database = os.environ.get('PGDATABASE', '')
    if args.local_disposable:
        validate_local_target(host, database)
    else:
        validate_remote_target(os.environ, allowed_ref)
    return database


def validate_local_target(host, database):
    if host not in ('127.0.0.1', 'localhost', '::1') or not database.startswith('estoque_rpc_test'):
        raise ValueError('--local-disposable exige PGHOST loopback e PGDATABASE estoque_rpc_test*.')
    if not os.environ.get('ESTOQUE_INSTALL_PSQL_PREFIX_JSON'):
        raise ValueError('--local-disposable exige cliente descartável definido em ESTOQUE_INSTALL_PSQL_PREFIX_JSON.')


def validate_base_fingerprint():
    baseline_hash = hashlib.sha256()
    for filename in PLAN['base']:
        content = (ROOT / filename).read_text(encoding='utf8').replace('\r\n', '\n')
        baseline_hash.update(filename.encode('utf8') + b'\0' + content.encode('utf8') + b'\0')
    if baseline_hash.hexdigest() != PLAN['baseSha256']:
        raise ValueError('SQL-base mudou sem atualização revisada da impressão digital de instalação.')


def prepare_psql_env(local_disposable):
    env = os.environ.copy()
    env['PGCLIENTENCODING'] = 'UTF8'
    if local_disposable:
        env.pop('PGHOST', None)
        env.pop('PGPASSWORD', None)
    else:
        env['PGSSLMODE'] = 'verify-full'
        certificate = env.get('PGSSLROOTCERT', '')
        if not certificate or not Path(certificate).is_file():
            raise ValueError('Configure PGSSLROOTCERT com o certificado CA do Supabase para validar TLS.')
        env['PGPASSWORD'] = getpass.getpass('Senha do banco (entrada oculta): ')
        if not env['PGPASSWORD']:
            raise ValueError('A senha do banco não pode estar vazia.')
    return env


def verify_safety_scan():
    scan = subprocess.run(['node', str(ROOT / 'scripts/admin/clean-install-safety.cjs')],
                          text=True, capture_output=True, cwd=ROOT, timeout=30)
    if scan.returncode:
        raise ValueError(scan.stderr.strip() or 'A varredura de segurança do roteiro falhou.')
    print(scan.stdout.strip())


def verify_postgres_major(command, database, env):
    major = int(run_psql(command, database, env, "select current_setting('server_version_num')::int / 10000;"))
    if major != PLAN['postgresMajor']:
        raise ValueError(f'PostgreSQL incompatível: o roteiro exige major {PLAN["postgresMajor"]}.')


def verify_empty_application(command, database, env):
    query = """
      select coalesce((select string_agg(n.nspname || '.' || c.relname, ',' order by n.nspname,c.relname)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where c.relname = any (array['app_users','app_sessions','app_login_attempts','app_user_edit_audit',
          'establishments','tenant_memberships','user_permissions','permission_audit','tenant_inventory',
          'pending_receipts','cash_closings','external_fiscal_rate_limits','shared_inventory'])
          and c.relkind in ('r','p','v','m','f')), ''),
        exists(select 1 from pg_catalog.pg_namespace where nspname='private');
    """
    app_objects, private_exists = run_psql(command, database, env, query).split('|')
    if app_objects or private_exists == 't':
        raise ValueError('Banco não vazio: há schema private ou objeto do Estoque+. Use migrações incrementais.')


def verify_migration_history_empty(command, database, env):
    ledger = "select to_regclass('supabase_migrations.schema_migrations') is not null;"
    if run_psql(command, database, env, ledger) == 't':
        columns = run_psql(command, database, env, "select column_name from information_schema.columns "
            "where table_schema='supabase_migrations' and table_name='schema_migrations';")
        if not {'version', 'name', 'statements'}.issubset(set(columns.splitlines())):
            raise ValueError('Histórico de migrações incompatível; instalação interrompida.')
        if run_psql(command, database, env, 'select count(*) from supabase_migrations.schema_migrations;') != '0':
            raise ValueError('Histórico de migrações já possui registros; instalação limpa recusada.')
    baseline = "select to_regclass('supabase_migrations.estoque_installation_baselines') is not null;"
    if run_psql(command, database, env, baseline) == 't':
        raise ValueError('Histórico do SQL-base já existe; instalação limpa recusada.')


def verify_supabase_prerequisites(command, database, env):
    query = """
      select (select count(*)=3 from pg_catalog.pg_roles where rolname=any(array['anon','authenticated','service_role']))
        and exists(select 1 from pg_catalog.pg_namespace where nspname='extensions')
        and to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null
        and to_regclass('storage.objects') is not null
        and exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
                   where e.extname='pgcrypto' and n.nspname='extensions');
    """
    if run_psql(command, database, env, query) != 't':
        raise ValueError('Destino não possui roles, schemas ou pgcrypto necessários do Supabase.')


def verify_tls_connection(command, database, env, local_disposable):
    if local_disposable:
        return
    encrypted = run_psql(command, database, env,
                         'select ssl from pg_catalog.pg_stat_ssl where pid=pg_backend_pid();')
    if encrypted != 't':
        raise ValueError('A conexão PostgreSQL não está usando TLS.')


def verify_resume_state(command, database, env):
    objects = run_psql(command, database, env,
        "select to_regclass('supabase_migrations.schema_migrations') is not null,"
        "to_regclass('supabase_migrations.estoque_installation_baselines') is not null,"
        "to_regclass('private.app_users') is not null, to_regclass('public.shared_inventory') is not null;")
    if objects != 't|t|t|t':
        raise ValueError('Retomada recusada: SQL-base ou fingerprint incompleto; preserve o banco e acione o DBA.')
    columns = run_psql(command, database, env, "select column_name from information_schema.columns "
        "where table_schema='supabase_migrations' and table_name='schema_migrations';")
    if not {'version', 'name', 'statements'}.issubset(set(columns.splitlines())):
        raise ValueError('Ledger incompatível; retomada recusada e DBA deve revisar o destino.')
    baseline = run_psql(command, database, env,
        'select baseline_key || \'|\' || sha256 || \'|\' || array_to_string(source_files, \',\') '
        'from supabase_migrations.estoque_installation_baselines order by baseline_key;')
    expected_baseline = f"v1|{PLAN['baseSha256']}|{','.join(PLAN['base'])}"
    if baseline.splitlines() != [expected_baseline]:
        raise ValueError('Fingerprint do SQL-base ausente ou divergente; retomada recusada e DBA deve revisar o destino.')
    ledger = run_psql(command, database, env,
        "select coalesce(string_agg(version || '|' || name || '|' || (statements is null)::text, E'\\n' order by version), '') "
        'from supabase_migrations.schema_migrations;')
    rows = ledger.splitlines() if ledger else []
    if any(not row.endswith('|true') for row in rows):
        raise ValueError('Ledger contém registro incompatível; retomada recusada e DBA deve revisar o destino.')
    return validate_migration_prefix([row[:-5] for row in rows], PLAN['migrations'])


def installation_history_sql():
    filenames = ','.join(repr(filename) for filename in PLAN['base'])
    return (
        'create schema if not exists supabase_migrations; '
        'create table if not exists supabase_migrations.schema_migrations '
        '(version text primary key not null, statements text[], name text); '
        'create table supabase_migrations.estoque_installation_baselines '
        '(baseline_key text primary key, sha256 text not null, source_files text[] not null, installed_at timestamptz not null default now()); '
        'insert into supabase_migrations.estoque_installation_baselines(baseline_key,sha256,source_files) '
        f"values ('v1','{PLAN['baseSha256']}',array[{filenames}]); "
        'revoke all on schema supabase_migrations from public, anon, authenticated, service_role; '
        'revoke all on all tables in schema supabase_migrations from public, anon, authenticated, service_role;')


def apply_base(command, database, env):
    for index, filename in enumerate(PLAN['base'], start=1):
        sql = (ROOT / filename).read_text(encoding='utf8')
        if index == len(PLAN['base']):
            sql += '\n' + installation_history_sql()
        run_psql(command, database, env, sql, single_transaction=True)
        print(f'Aplicado SQL-base {index}/{len(PLAN["base"])}: {filename}')


def migration_ledger_sql(version, name):
    return ("insert into supabase_migrations.schema_migrations(version,name,statements) "
            f"values ('{version}','{name}',null);")


def strip_explicit_transaction(filename, source):
    if filename not in PLAN['explicitTransactionFiles']:
        return source
    lines = source.splitlines(keepends=True)
    controls = [(index, line.strip().upper()) for index, line in enumerate(lines)
                if line.strip().upper() in ('BEGIN;', 'COMMIT;', 'ROLLBACK;')]
    if len(controls) != 2 or [control for _, control in controls] != ['BEGIN;', 'COMMIT;']:
        raise ValueError(f'Bloco transacional inesperado em {filename}.')
    if any(line.strip() for line in lines[controls[-1][0] + 1:]):
        raise ValueError(f'COMMIT não é o último comando de {filename}.')
    return ''.join(line for index, line in enumerate(lines)
                   if index not in (controls[0][0], controls[1][0]))


def apply_migrations(command, database, env, filenames=None):
    pending = PLAN['migrations'] if filenames is None else filenames
    for filename in pending:
        match = re.match(r'supabase/migrations/(\d{14})_(.+)\.sql$', filename)
        if not match:
            raise ValueError(f'Nome de migração inválido no plano: {filename}')
        source = (ROOT / filename).read_text(encoding='utf8')
        source = strip_explicit_transaction(filename, source)
        source += '\n' + migration_ledger_sql(*match.groups())
        run_psql(command, database, env, source, single_transaction=True)
        index = PLAN['migrations'].index(filename) + 1
        print(f'Aplicada migração {index}/{len(PLAN["migrations"])}: {filename}')


def print_preflight_plan(database, local_disposable):
    destination = 'PostgreSQL descartável local' if local_disposable else f"Estoque+ DB ({PLAN['supabaseRef']})"
    print(f'PRE-FLIGHT OK: destino validado: {destination}; database={database}; PostgreSQL 17.')
    for filename in PLAN['base'] + PLAN['migrations']:
        print(f'- {filename}')
    print('Nenhum comando de escrita foi executado pelo preflight.')


def main():
    args = parse_args()
    allowed_ref = os.environ.get('ESTOQUE_SUPABASE_ALLOWED_REF', '')
    database = validate_target(args, allowed_ref)
    validate_base_fingerprint()
    verify_safety_scan()
    psql_env = prepare_psql_env(args.local_disposable)
    command = psql_prefix()
    verify_tls_connection(command, database, psql_env, args.local_disposable)
    verify_postgres_major(command, database, psql_env)
    verify_supabase_prerequisites(command, database, psql_env)
    if args.preflight:
        verify_empty_application(command, database, psql_env)
        verify_migration_history_empty(command, database, psql_env)
        print_preflight_plan(database, args.local_disposable)
        return
    if args.resume:
        pending = verify_resume_state(command, database, psql_env)
        if pending:
            print(f'Retomada validada: {len(pending)} migração(ões) pendente(s).')
            apply_migrations(command, database, psql_env, pending)
        else:
            print('Retomada validada: ledger já está completo; nenhuma escrita necessária.')
        print('Retomada concluída. Execute o checklist documentado antes de usar a aplicação.')
        return
    verify_empty_application(command, database, psql_env)
    verify_migration_history_empty(command, database, psql_env)
    apply_base(command, database, psql_env)
    apply_migrations(command, database, psql_env)
    print('Instalação limpa concluída. Execute o checklist documentado antes de usar a aplicação.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        message = str(error).replace(os.environ.get('PGPASSWORD', '\0'), '[REDACTADO]')
        print(f'Instalação interrompida: {message}', file=sys.stderr)
        sys.exit(1)
