-- Only an authenticated DBA can reset manager passwords.
-- Managers may reset employees of their currently selected establishment.
create or replace function public.inventory_admin_password_reset(
  p_token text, p_user_id uuid, p_temporary_password text
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  actor private.app_users%rowtype;
  target_user private.app_users%rowtype;
  current_unit uuid;
begin
  actor := private.require_actor(p_token);
  if actor.role not in ('superadmin','admin') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  if p_user_id is null or p_user_id = actor.id then
    raise exception 'Usuário inválido' using errcode='22023';
  end if;
  if length(coalesce(p_temporary_password,'')) < 12
     or octet_length(p_temporary_password) > 72 then
    raise exception 'A senha provisória deve ter 12 a 72 bytes' using errcode='22023';
  end if;
  select * into target_user from private.app_users where id=p_user_id for update;
  if not found or not target_user.active or target_user.role='superadmin' then
    raise exception 'Usuário indisponível' using errcode='42501';
  end if;
  if actor.role='admin' then
    if target_user.role <> 'employee' then
      raise exception 'Somente o DBA pode redefinir senhas de gestores' using errcode='42501';
    end if;
    select s.tenant_id into current_unit from private.app_sessions s
      where s.user_id=actor.id
        and s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
        and s.revoked_at is null and s.expires_at>statement_timestamp();
    if current_unit is null or not exists(
      select 1 from private.tenant_memberships own
      join private.tenant_memberships member on member.tenant_id=own.tenant_id
      where own.user_id=actor.id and own.role='admin'
        and member.user_id=target_user.id and member.role='employee'
        and own.tenant_id=current_unit
    ) then
      raise exception 'Funcionário fora da unidade' using errcode='42501';
    end if;
  end if;
  update private.app_users set
    password_hash=extensions.crypt(p_temporary_password,extensions.gen_salt('bf',12)),
    must_change_password=true
    where id=target_user.id;
  update private.app_sessions set revoked_at=statement_timestamp()
    where user_id=target_user.id and revoked_at is null;
  delete from private.app_login_attempts where username=target_user.username;
  return jsonb_build_object('ok',true);
end;
$function$;
revoke all on function public.inventory_admin_password_reset(text,uuid,text) from public;
grant execute on function public.inventory_admin_password_reset(text,uuid,text) to anon,authenticated;
