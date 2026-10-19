-- Additive migration for the native Estoque+ sessions (issue #27 / PR #26).
-- Requires db/schema.sql. Never run the bootstrap schema on an existing database.
begin;
set local lock_timeout = '5s';

-- Fail closed on a drifted/insecure baseline; do not silently change existing ACLs.
do $preflight$
declare
  relation regclass;
  api_role text;
begin
  foreach relation in array array[
    'private.app_users'::regclass, 'private.app_sessions'::regclass,
    'public.shared_inventory'::regclass
  ] loop
    if not (select relrowsecurity from pg_catalog.pg_class where oid = relation) then
      raise exception 'RLS prerequisite missing on %', relation;
    end if;
    foreach api_role in array array['anon', 'authenticated'] loop
      if pg_catalog.has_table_privilege(api_role, relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or pg_catalog.has_any_column_privilege(api_role, relation, 'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Direct table/column privileges must be reviewed for % on %', api_role, relation;
      end if;
    end loop;
  end loop;
end;
$preflight$;

create function private.inventory_validate_session_impl(p_session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid;
  actor_role text;
begin
  -- Bound hashing work and preserve the exact, case-sensitive token bytes.
  if p_session_token is null or pg_catalog.octet_length(p_session_token) <> 64
    or p_session_token !~ '^[a-fA-F0-9]{64}$' then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Entre novamente.';
  end if;

  -- One statement snapshot, using the existing token_hash PK and user PK.
  -- statement_timestamp avoids accepting expired sessions in old transactions.
  select u.id, u.role into actor_id, actor_role
    from private.app_sessions s
    join private.app_users u on u.id = s.user_id
   where s.token_hash = pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex')
     and s.expires_at > pg_catalog.statement_timestamp()
     and s.revoked_at is null
     and u.active = true;
  if not found then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Entre novamente.';
  end if;

  -- Explicit allowlist: never serialize table rows, credentials or stock.
  return pg_catalog.jsonb_build_object('valid', true,
    'user', pg_catalog.jsonb_build_object('id', actor_id, 'role', actor_role));
end;
$function$;

-- Match the existing public invoker / private definer architecture.
create function public.inventory_validate_session(p_session_token text)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select private.inventory_validate_session_impl(p_session_token);
$function$;

revoke all on function private.inventory_validate_session_impl(text) from public, anon, authenticated;
revoke all on function public.inventory_validate_session(text) from public, anon, authenticated;
grant execute on function private.inventory_validate_session_impl(text) to anon, authenticated;
grant execute on function public.inventory_validate_session(text) to anon, authenticated;
comment on function public.inventory_validate_session(text) is
  'Native session validation only. Returns {valid:true,user:{id,role}} or SQLSTATE 28000. No stock access; no Supabase Auth dependency.';
notify pgrst, 'reload schema';
commit;
