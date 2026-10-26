-- Catalog audit after the complete migration chain. No remote data needed.
do $$ declare findings text; begin
 select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
 into findings from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef
 and not coalesce(p.proconfig @> array['search_path=""']::text[],false);
 if findings is not null then raise exception 'SECURITY DEFINER without empty search_path: %',findings; end if;
 select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
 into findings from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef and exists(
  select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where a.grantee=0 and a.privilege_type='EXECUTE');
 if findings is not null then raise exception 'PUBLIC EXECUTE on SECURITY DEFINER: %',findings; end if;
 select string_agg(p.oid::regprocedure::text, ', ') into findings from pg_proc p
 where p.pronamespace='private'::regnamespace and (
 has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));
 if findings is not null then raise exception 'Private function exposed: %',findings; end if;
 select string_agg(c.oid::regclass::text, ', ') into findings from pg_class c
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') and c.relkind in ('r','p') and not c.relrowsecurity;
 if findings is not null then raise exception 'Application tables missing RLS: %',findings; end if;
end $$;

-- Exercise actual permission failures as each Data API role; positive queries
-- and domain-level tenant/session cases run separately in tenant-access.sql.
set role anon;
do $$ begin
 begin perform 1 from private.app_users; raise exception 'anon read users'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.shared_inventory; raise exception 'anon read inventory'; exception when insufficient_privilege then null; end;
 begin perform private.inventory_get_impl(repeat('0',64)); raise exception 'anon private RPC'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_get(repeat('0',64)); raise exception 'anon invalid token'; exception when invalid_authorization_specification then null; end;
end $$;
reset role;
set role authenticated;
do $$ begin
 begin perform 1 from private.app_sessions; raise exception 'authenticated read sessions'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.shared_inventory; raise exception 'authenticated read inventory'; exception when insufficient_privilege then null; end;
 begin perform private.inventory_get_impl(repeat('0',64)); raise exception 'authenticated private RPC'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_get(repeat('0',64)); raise exception 'authenticated invalid token'; exception when invalid_authorization_specification then null; end;
end $$;
reset role;
