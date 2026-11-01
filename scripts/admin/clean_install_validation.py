"""Pure destination and migration-ledger validation for the clean installer."""
import re


def validate_remote_target(environment, allowed_ref):
    """Accept only the confirmed direct endpoint or shared session pooler."""
    host = environment.get('PGHOST', '')
    database = environment.get('PGDATABASE', '')
    port = environment.get('PGPORT', '5432')
    username = environment.get('PGUSER', '')
    direct_host = f'db.{allowed_ref}.supabase.co'
    session_host = re.fullmatch(r'aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com', host)
    if database != 'postgres' or port != '5432':
        raise ValueError('Use database postgres na porta 5432; transaction pooler (6543) é recusado.')
    if host == direct_host and username == 'postgres':
        return
    if session_host and username == f'postgres.{allowed_ref}':
        return
    raise ValueError('Destino inválido: use host direto do ref autorizado ou session pooler com usuário postgres.<ref>.')


def validate_migration_prefix(applied_rows, migration_files):
    """Return pending migrations only when the ledger is an exact plan prefix."""
    expected = []
    for filename in migration_files:
        match = re.fullmatch(r'supabase/migrations/(\d{14})_(.+)\.sql', filename)
        if not match:
            raise ValueError(f'Nome de migração inválido no plano: {filename}')
        expected.append('|'.join(match.groups()))
    if applied_rows != expected[:len(applied_rows)]:
        raise ValueError('Ledger incoerente: versões aplicadas não formam um prefixo do plano; pare e acione o DBA.')
    return migration_files[len(applied_rows):]
