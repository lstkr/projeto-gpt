-- Estoque+ #132: guarantee no protected RPC remains in flight when
-- account deactivation commits. Account deactivation itself lives in the
-- versioned inventory_user_update migration, never in browser code.
--
-- SECURITY: each authorized call holds a transaction-scoped SHARE lock
-- on its session row. A deactivation UPDATE of revoked_at must await
-- these locks, so when the inactivation RPC returns, all older authorized
-- transactions are finished. New operations see active=false/revoked_at.
-- This intentionally trades some same-token concurrency for revocation safety.
begin;
set local lock_timeout='5s';

create or replace function private.require_actor(p_token text,p_allow_change boolean default false)
returns private.app_users language plpgsql volatile security definer set search_path='' as $function$
declare actor private.app_users%rowtype;
begin
 if p_token is null or octet_length(p_token)<>64 or p_token !~ '^[a-fA-F0-9]{64}$' then
  raise exception 'Sessão inválida' using errcode='28000';
 end if;
 select u.* into actor from private.app_sessions s
 join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and s.revoked_at is null and s.expires_at>statement_timestamp() and u.active
 for share of s;
 if not found then raise exception 'Sessão inválida' using errcode='28000'; end if;
 if actor.must_change_password and not p_allow_change then
  raise exception 'Troque sua senha antes de continuar' using errcode='42501'; end if;
 return actor;
end;
$function$;

-- Do not allow a login that read active=true to create a fresh unrevoked
-- session *after* inactivation swept app_sessions. A row SHARE lock on the
-- account serializes login and the account's FOR UPDATE deactivation.
do $patch_login$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('private.inventory_login_impl(text,text)'::regprocedure);
 updated:=replace(definition,
   'where username = normalized_username and active = true;',
   'where username = normalized_username and active = true for share;');
 if updated=definition then
   raise exception 'Login lock migration did not find expected SELECT. Review schema drift.';
 end if;
 execute updated;
end;
$patch_login$;

-- Session checks now acquire the same transaction-scoped lock as mutations.
-- Volatile prevents read-only invocation of a SELECT ... FOR SHARE from
-- stable wrappers; POST RPC is used by the UI monitor.
alter function private.inventory_validate_session_impl(text) volatile;
alter function public.inventory_validate_session(text) volatile;
revoke all on function private.require_actor(text,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
