-- Owner-only, POST-CUTOVER snapshot before an authorized test reset.
-- Contains credentials and fiscal data: never export results, expose schema or log rows.
-- Same-project recovery only; this is not disaster recovery or a pg_dump substitute.
begin;
create schema estoque_recovery_20261021;
revoke all on schema estoque_recovery_20261021 from public,anon,authenticated;
create table estoque_recovery_20261021.manifest(
 source_schema text not null, source_table text not null, snapshot_table text not null,
 row_count bigint not null, digest text not null, metadata jsonb not null,
 primary key(source_schema,source_table)
);
create table estoque_recovery_20261021.functions as
 select n.nspname as schema_name,p.proname,p.oid::regprocedure::text as signature,
 pg_get_functiondef(p.oid) as definition,p.proacl,p.proowner::regrole::text as owner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prokind='f';
create table estoque_recovery_20261021.views as
 select n.nspname as schema_name,c.relname,pg_get_viewdef(c.oid,true) as definition,c.relacl,c.relowner::regrole::text as owner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='v';
do $$
declare t record; snapshot_name text; total bigint; fingerprint text;
begin
 if to_regclass('private.tenant_inventory') is null then raise exception 'Apply and homologate tenant cutover first'; end if;
 for t in select c.oid,n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relowner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') and c.relkind='r' and c.relname not like 'estq_backup_%'
 order by n.nspname,c.relname loop
  execute format('lock table %I.%I in share mode',t.nspname,t.relname);
  snapshot_name:=t.nspname||'_'||t.relname;
  execute format('create table estoque_recovery_20261021.%I as table %I.%I',snapshot_name,t.nspname,t.relname);
  execute format('select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from %I.%I r',t.nspname,t.relname) into total,fingerprint;
  insert into estoque_recovery_20261021.manifest values(t.nspname,t.relname,snapshot_name,total,fingerprint,
   jsonb_build_object('acl',t.relacl::text,'owner',t.relowner::regrole::text,'rls',t.relrowsecurity,
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid))) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
    'constraints',(select jsonb_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid=t.oid),
    'indexes',(select jsonb_agg(pg_get_indexdef(indexrelid)) from pg_index where indrelid=t.oid),
    'policies',(select jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'roles',polroles,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid))) from pg_policy where polrelid=t.oid)));
 end loop;
end $$;
revoke all on all tables in schema estoque_recovery_20261021 from public,anon,authenticated;
commit;
