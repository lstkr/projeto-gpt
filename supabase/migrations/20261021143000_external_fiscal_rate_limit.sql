-- Estoque+ issue #23: shared, per-user and global throttling for external
-- fiscal services. Uses native app sessions; no Supabase Auth assumption.
-- Additive migration: no writes to users, their password hashes, sessions,
-- shared inventory or fiscal documents.
begin;
set local lock_timeout = '5s';

create table if not exists private.external_fiscal_rate_limits (
  scope text not null,
  minute_bucket bigint not null,
  hits integer not null check (hits > 0),
  primary key (scope, minute_bucket)
);
alter table private.external_fiscal_rate_limits enable row level security;
revoke all on private.external_fiscal_rate_limits from public, anon, authenticated;

create or replace function public.inventory_external_rate_limit(p_session_token text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  uid uuid;
  v_bucket bigint;
  v_epoch bigint;
  v_global_hits int;
  v_user_hits int;
  v_user_max int;
  v_global_max int := 180;
  v_retry int;
begin
  if p_endpoint not in ('qr', 'nfce') or p_endpoint is null then
    raise exception 'Serviço fiscal não reconhecido' using errcode = '22023';
  end if;
  if p_session_token is null
    or pg_catalog.octet_length(p_session_token) <> 64
    or p_session_token !~ '^[a-fA-F0-9]{64}$' then
    raise exception 'Sessão inválida' using errcode = '28000';
  end if;
  select u.id into uid
  from private.app_sessions s
  join private.app_users u on u.id = s.user_id
  where s.token_hash = pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    and s.expires_at > pg_catalog.clock_timestamp()
    and s.revoked_at is null and u.active;
  if not found then
    raise exception 'Sessão inválida' using errcode = '28000';
  end if;

  v_epoch := pg_catalog.extract(epoch from pg_catalog.clock_timestamp())::bigint;
  v_bucket := v_epoch / 60;
  v_retry := greatest(1, 60 - (v_epoch % 60)::int);
  v_user_max := case when p_endpoint='qr' then 18 else 30 end;

  -- Atomic counters make limits consistent across serverless instances.
  insert into private.external_fiscal_rate_limits (scope, minute_bucket, hits)
  values ('global:' || p_endpoint, v_bucket, 1)
  on conflict (scope, minute_bucket)
  do update set hits = private.external_fiscal_rate_limits.hits + 1
  returning hits into v_global_hits;

  if v_global_hits > v_global_max then
    return pg_catalog.jsonb_build_object('allowed',false,'retry_after',v_retry);
  end if;

  insert into private.external_fiscal_rate_limits (scope, minute_bucket, hits)
  values ('user:' || uid::text || ':' || p_endpoint, v_bucket, 1)
  on conflict (scope, minute_bucket)
  do update set hits = private.external_fiscal_rate_limits.hits + 1
  returning hits into v_user_hits;

  if v_user_hits > v_user_max then
    return pg_catalog.jsonb_build_object('allowed',false,'retry_after',v_retry);
  end if;

  -- Opportunistic pruning; no unbounded data retained across test cycles.
  if pg_catalog.random() < 0.01 then
    delete from private.external_fiscal_rate_limits
      where minute_bucket < v_bucket - 1440;
  end if;
  return pg_catalog.jsonb_build_object('allowed',true,'retry_after',0);
end;
$function$;

revoke all on function public.inventory_external_rate_limit(text,text) from public;
grant execute on function public.inventory_external_rate_limit(text,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
