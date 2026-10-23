-- Editable identity metadata only. No passwords/roles/memberships altered.
-- Apply to a disposable PostgreSQL instance first; never directly on production.
begin;

create table if not exists private.app_user_edit_audit(
 id bigint generated always as identity primary key,
 actor_id uuid not null references private.app_users(id),
 target_id uuid not null references private.app_users(id),
 changed_at timestamptz not null default statement_timestamp(),
 old_username text not null,
 new_username text not null,
 old_display_name text not null,
 new_display_name text not null,
 old_active boolean not null,
 new_active boolean not null
);
alter table private.app_user_edit_audit enable row level security;
revoke all on private.app_user_edit_audit from public,anon,authenticated;

create or replace function public.inventory_user_update(
 p_token text, p_user_id uuid, p_username text, p_display_name text, p_active boolean
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 actor private.app_users%rowtype;
 target_user private.app_users%rowtype;
 current_unit uuid;
 new_username text:=lower(btrim(coalesce(p_username,'')));
 new_name text:=btrim(coalesce(p_display_name,''));
begin
 actor:=private.require_actor(p_token);
 if actor.role not in ('admin','superadmin') or p_user_id is null or p_active is null then
  raise exception 'Operação não autorizada' using errcode='42501';
 end if;
 if new_username !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
   or length(new_name) not between 1 and 120 then
  raise exception 'Nome/login inválido' using errcode='22023';
 end if;
 select * into target_user from private.app_users where id=p_user_id for update;
 if not found or target_user.role='superadmin' or target_user.id=actor.id then
  raise exception 'Usuário indisponível' using errcode='42501';
 end if;
 if actor.role='admin' then
  if target_user.role<>'employee' then
   raise exception 'Somente DBA edita gestores' using errcode='42501';
  end if;
  select s.tenant_id into current_unit from private.app_sessions s
   where s.user_id=actor.id and s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
   and s.revoked_at is null and s.expires_at>statement_timestamp();
  if current_unit is null or not exists (
    select 1 from private.tenant_memberships own
    join private.tenant_memberships member on member.tenant_id=own.tenant_id
    where own.user_id=actor.id and own.role='admin'
      and own.tenant_id=current_unit and member.user_id=target_user.id
      and member.role='employee'
  ) then raise exception 'Usuário fora da unidade ativa' using errcode='42501'; end if;
 end if;
 -- Protect the only remaining active manager for each of their units.
 if target_user.role='admin' and target_user.active and not p_active then
  if exists (
   select 1 from private.tenant_memberships membership
   where membership.user_id=target_user.id and membership.role='admin'
    and not exists (
      select 1 from private.tenant_memberships other
      join private.app_users u on u.id=other.user_id
      where other.tenant_id=membership.tenant_id and other.role='admin'
        and u.active and u.id<>target_user.id
    )
  ) then raise exception 'Último gestor ativo da unidade' using errcode='42501'; end if;
 end if;

 if (target_user.username,target_user.display_name,target_user.active)
    is not distinct from (new_username,new_name,p_active) then
  return jsonb_build_object('ok',true,'changed',false);
 end if;
 update private.app_users set username=new_username,display_name=new_name,active=p_active where id=p_user_id;
 insert into private.app_user_edit_audit(actor_id,target_id,
  old_username,new_username,old_display_name,new_display_name,old_active,new_active)
 values(actor.id,p_user_id,target_user.username,new_username,target_user.display_name,new_name,
  target_user.active,p_active);
 if target_user.username<>new_username then
  delete from private.app_login_attempts where username in (target_user.username,new_username);
 end if;
 if target_user.active and not p_active then
  update private.app_sessions set revoked_at=statement_timestamp()
   where user_id=p_user_id and revoked_at is null;
 end if;
 return jsonb_build_object('ok',true,'changed',true);
end;
$function$;
revoke all on function public.inventory_user_update(text,uuid,text,text,boolean) from public;
grant execute on function public.inventory_user_update(text,uuid,text,text,boolean) to anon,authenticated;
commit;
