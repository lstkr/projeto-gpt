-- Snapshot anterior à B1: somente no Estoque+ DB de homologação, após confirmar destino.
-- Não exportar conteúdo: contém dados financeiros. Não é backup externo de desastre.
begin;
set local lock_timeout = '5s';
do $$
begin
 if to_regclass('private.cash_closings') is null
 or to_regclass('private.cash_closing_audit') is not null then
  raise exception 'Backup B1 exige banco anterior à migração, com fechamentos existentes';
 end if;
end $$;
-- O nome fixo impede sobrescrever acidentalmente o ponto de recuperação inicial.
create schema estoque_recovery_b1_20261101;
revoke all on schema estoque_recovery_b1_20261101 from public,anon,authenticated,service_role;
lock table private.cash_closings in share mode;
create table estoque_recovery_b1_20261101.cash_closings as table private.cash_closings;
create table estoque_recovery_b1_20261101.functions as
 select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition,
 p.proacl as permissions,p.proowner::regrole::text as owner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.oid in
 ('public.cash_closing_save(text,jsonb)'::regprocedure,'public.cash_closings_list(text)'::regprocedure);
create table estoque_recovery_b1_20261101.manifest as
 select clock_timestamp() as created_at,count(*) as row_count,
 md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' order by id),'')) as fingerprint
 from estoque_recovery_b1_20261101.cash_closings c;
alter table estoque_recovery_b1_20261101.cash_closings enable row level security;
alter table estoque_recovery_b1_20261101.functions enable row level security;
alter table estoque_recovery_b1_20261101.manifest enable row level security;
revoke all on all tables in schema estoque_recovery_b1_20261101 from public,anon,authenticated,service_role;
do $$
begin
 if (select count(*) from estoque_recovery_b1_20261101.functions)<>2
 or exists(select 1 from estoque_recovery_b1_20261101.manifest where row_count<>
   (select count(*) from private.cash_closings) or fingerprint is distinct from
   (select md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' order by id),''))
    from private.cash_closings c)) then
  raise exception 'Snapshot B1 incompleto; nenhuma migração deve ser aplicada';
 end if;
end $$;
commit;
