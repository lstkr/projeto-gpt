-- Consultas somente leitura pós-instalação; executar no banco PostgreSQL descartável.
select 'private_tables', count(*) from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='private' and c.relkind in ('r','p');

select 'public_views', count(*) from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v'
and c.relname=any(array['shared_inventory','pending_receipts','cash_closings']);

select 'private_tables_without_rls', coalesce(string_agg(c.relname,',' order by c.relname),'none')
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='private' and c.relkind in ('r','p') and not c.relrowsecurity;

select 'application_functions_without_search_path', coalesce(string_agg(n.nspname||'.'||p.proname,',' order by n.nspname,p.proname),'none')
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('private','public') and p.prokind in ('f','p')
and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path%';

select 'migration_history_rows', count(*) from supabase_migrations.schema_migrations;
select 'baseline_fingerprint_rows', count(*) from supabase_migrations.estoque_installation_baselines;

-- private não exposto ao PostgREST e Security Advisor são verificações manuais
-- no Supabase Dashboard do responsável; este SQL local não acessa o Supabase real.
