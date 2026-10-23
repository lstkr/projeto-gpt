-- Roll back server-derived author fields while retaining the attribution audit.
-- Run only after the application build has been rolled back to a compatible release.
-- The table and its rows intentionally remain available for audit/history.
do $rollback$
declare
  definition text;
  declaration_anchor text := E'  active_tenant uuid;\n';
  session_anchor text := E'  perform private.set_tenant_context(p_session_token);\n  active_tenant := private.current_tenant();\n\n';
  write_marker text := '  -- The JSON snapshot stays backward compatible; author fields are overwritten';
  write_anchor text := '  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;';
  block_start integer;
  block_end integer;
  retained_security boolean;
  retained_config text[];
begin
  select p.prosecdef, p.proconfig
    into retained_security, retained_config
    from pg_catalog.pg_proc p
   where p.oid = 'private.inventory_save_impl(text,jsonb)'::regprocedure;
  if not found or not retained_security
     or not exists (select 1 from unnest(coalesce(retained_config,'{}'::text[])) c where c like 'search_path=%') then
    raise exception 'Expected SECURITY DEFINER inventory_save_impl with fixed search_path';
  end if;

  definition := pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure);
  block_start := position(write_marker in definition);
  block_end := case when block_start > 0 then position(write_anchor in substring(definition from block_start)) else 0 end;
  if block_start=0 or block_end=0
     or position(declaration_anchor in definition)=0
     or position(session_anchor in definition)=0 then
    raise exception 'Fiscal attribution rollback anchors do not match the installed RPC';
  end if;
  block_end := block_start + block_end - 1;
  definition := overlay(definition placing write_anchor from block_start for block_end - block_start + length(write_anchor));
  definition := replace(definition, declaration_anchor, '');
  definition := replace(definition, session_anchor, '');
  execute definition;

  if not exists (
    select 1 from pg_catalog.pg_proc p
     where p.oid = 'private.inventory_save_impl(text,jsonb)'::regprocedure
       and p.prosecdef = retained_security
       and p.proconfig is not distinct from retained_config
  ) then
    raise exception 'Rollback changed inventory_save_impl security attributes';
  end if;
  if position(write_marker in pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure)) > 0 then
    raise exception 'Fiscal attribution patch remains after rollback';
  end if;
end;
$rollback$;

notify pgrst, 'reload schema';
