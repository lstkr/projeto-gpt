-- Estoque+ | ACL por usuario e operacao fiscal.
-- Executar depois de db/schema.sql e db/pending-receipts.sql.
-- Idempotente. RPCs expostas usam sessao individual; configuracao so pelo gestor.
create table if not exists private.user_permissions (
 user_id uuid not null references private.app_users(id) on delete cascade,
 permission_key text not null check (permission_key in (
  'fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel'
 )),
 allowed boolean not null,
 updated_by uuid references private.app_users(id),
 updated_at timestamptz not null default now(),
 primary key(user_id,permission_key)
);
alter table private.user_permissions enable row level security;
revoke all on private.user_permissions from public,anon,authenticated;
drop policy if exists deny_user_permissions on private.user_permissions;
create policy deny_user_permissions on private.user_permissions for all to anon,authenticated using(false) with check(false);

create table if not exists private.permission_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references private.app_users(id),
 target_id uuid not null references private.app_users(id),
 permission_key text not null,
 previous_allowed boolean,
 new_allowed boolean not null,
 created_at timestamptz not null default now()
);
alter table private.permission_audit enable row level security;
revoke all on private.permission_audit from public,anon,authenticated;

create or replace function private.has_permission(p_user uuid,p_key text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
   select 1 from private.app_users u
   where u.id=p_user and u.active
     and (
      case when p_key='fiscal.pending.cancel' then
        u.role='admin' and coalesce(
           (select up.allowed from private.user_permissions up where up.user_id=u.id and up.permission_key=p_key),
           true)
      when p_key in ('fiscal.pending.read','fiscal.pending.create','fiscal.pending.review') then
        coalesce((select up.allowed from private.user_permissions up
                  where up.user_id=u.id and up.permission_key=p_key),true)
      else false end
     )
 );
$$;
revoke all on function private.has_permission(uuid,text) from public,anon,authenticated;

create or replace function public.inventory_permissions_list(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor private.app_users%rowtype;
begin
 select u.* into actor from private.app_sessions s
 join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
   and s.expires_at>now() and s.revoked_at is null and u.active;
 if not found then raise exception 'Sessao invalida' using errcode='42501'; end if;
 if actor.role='admin' then
  return jsonb_build_object('self',(
    select jsonb_object_agg(k,private.has_permission(actor.id,k))
    from unnest(array['fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel']) k
  ),'users',coalesce((
    select jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'username',u.username,
      'role',u.role,'active',u.active,'permissions',(
        select jsonb_object_agg(k,private.has_permission(u.id,k))
        from unnest(array['fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel']) k
      )) order by u.display_name)
    from private.app_users u
  ),'[]'::jsonb));
 end if;
 return jsonb_build_object('self',(
  select jsonb_object_agg(k,private.has_permission(actor.id,k))
  from unnest(array['fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel']) k
 ),'users','[]'::jsonb);
end;
$$;

create or replace function public.inventory_permission_set(
 p_token text,p_user_id uuid,p_key text,p_allowed boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor private.app_users%rowtype; previous boolean;
begin
 select u.* into actor from private.app_sessions s
 join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
   and s.expires_at>now() and s.revoked_at is null and u.active;
 if not found or actor.role<>'admin' then
  raise exception 'Somente gestor pode editar permissoes.' using errcode='42501';
 end if;
 if p_key not in ('fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel')
   or p_allowed is null then
  raise exception 'Permissao invalida' using errcode='22023';
 end if;
 if not exists(select 1 from private.app_users where id=p_user_id) then
  raise exception 'Usuario inexistente' using errcode='22023';
 end if;
 if p_key='fiscal.pending.cancel'
   and p_allowed and not exists(select 1 from private.app_users where id=p_user_id and role='admin') then
  raise exception 'Cancelamento de nota e exclusivo do gestor' using errcode='42501';
 end if;
 previous:=private.has_permission(p_user_id,p_key);
 insert into private.user_permissions(user_id,permission_key,allowed,updated_by)
 values(p_user_id,p_key,p_allowed,actor.id)
 on conflict (user_id,permission_key) do update
 set allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now();
 insert into private.permission_audit(actor_id,target_id,permission_key,previous_allowed,new_allowed)
 values(actor.id,p_user_id,p_key,previous,p_allowed);
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.inventory_permissions_list(text) from public;
revoke all on function public.inventory_permission_set(text,uuid,text,boolean) from public;
grant execute on function public.inventory_permissions_list(text) to anon,authenticated;
grant execute on function public.inventory_permission_set(text,uuid,text,boolean) to anon,authenticated;
