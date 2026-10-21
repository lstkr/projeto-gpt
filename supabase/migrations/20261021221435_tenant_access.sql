-- Estoque+ tenant cutover. Apply only after isolated database acceptance tests.
-- Transaction preserves all existing users, password hashes and inventory IDs.
begin;
create table private.establishments (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 active boolean not null default true, created_at timestamptz not null default now()
);
insert into private.establishments(id,name) values ('00000000-0000-4000-8000-000000000001','Unidade existente');
alter table private.app_users drop constraint app_users_role_check;
alter table private.app_users add constraint app_users_role_check check(role in ('admin','employee','superadmin'));
alter table private.app_users add column must_change_password boolean not null default false;
create table private.tenant_memberships (
 user_id uuid not null references private.app_users(id), tenant_id uuid not null references private.establishments(id),
 role text not null check(role in ('admin','employee')), primary key(user_id,tenant_id)
);
create unique index tenant_employee_one_unit on private.tenant_memberships(user_id) where role='employee';
insert into private.tenant_memberships(user_id,tenant_id,role)
 select id,'00000000-0000-4000-8000-000000000001',role from private.app_users;
alter table private.app_sessions add column tenant_id uuid references private.establishments(id);
update private.app_sessions set tenant_id='00000000-0000-4000-8000-000000000001';

create function private.current_tenant() returns uuid language plpgsql stable set search_path='' as $$
declare tid uuid;
begin
 tid:=nullif(current_setting('estoque.tenant_id',true),'')::uuid;
 if tid is null then raise exception 'Unidade não selecionada' using errcode='42501'; end if;
 return tid;
end $$;
revoke all on function private.current_tenant() from public,anon,authenticated;

create function private.require_actor(p_token text,p_allow_change boolean default false)
returns private.app_users language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 select u.* into actor from private.app_sessions s join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.revoked_at is null and s.expires_at>now() and u.active;
 if not found then raise exception 'Sessão inválida' using errcode='28000'; end if;
 if actor.must_change_password and not p_allow_change then
  raise exception 'Troque sua senha antes de continuar' using errcode='42501'; end if;
 return actor;
end $$;
revoke all on function private.require_actor(text,boolean) from public,anon,authenticated;

create function private.set_tenant_context(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype; tid uuid;
begin
 perform set_config('estoque.tenant_id','',true);
 actor:=private.require_actor(p_token);
 select s.tenant_id into tid from private.app_sessions s
 join private.tenant_memberships m on m.user_id=s.user_id and m.tenant_id=s.tenant_id and m.role=actor.role
 join private.establishments e on e.id=m.tenant_id and e.active
 where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if tid is null or actor.role='superadmin' then raise exception 'Sem acesso à unidade' using errcode='42501'; end if;
 perform set_config('estoque.tenant_id',tid::text,true);
end $$;
revoke all on function private.set_tenant_context(text) from public,anon,authenticated;

-- Views isolate every legacy read/update, including nested fiscal and count RPCs.
alter table public.shared_inventory set schema private;
alter table private.shared_inventory rename to tenant_inventory;
alter table private.tenant_inventory drop constraint shared_inventory_pkey;
alter table private.tenant_inventory add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references private.establishments(id);
alter table private.tenant_inventory add primary key(tenant_id,id);
alter table private.tenant_inventory alter column tenant_id set default private.current_tenant();
create view public.shared_inventory with (security_barrier=true) as
 select id,state,updated_at from private.tenant_inventory where tenant_id=private.current_tenant() with local check option;

alter table public.pending_receipts set schema private;
alter table private.pending_receipts add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references private.establishments(id);
alter table private.pending_receipts alter column tenant_id set default private.current_tenant();
create view public.pending_receipts with (security_barrier=true) as
 select id,owner_id,file_name,mime,file_bytes,draft,state,revision,created_at,updated_at
 from private.pending_receipts where tenant_id=private.current_tenant() with local check option;

alter table public.cash_closings set schema private;
alter table private.cash_closings add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references private.establishments(id);
alter table private.cash_closings drop constraint cash_closings_day_register_key;
alter table private.cash_closings add unique(tenant_id,day,register);
alter table private.cash_closings alter column tenant_id set default private.current_tenant();
create view public.cash_closings with (security_barrier=true) as
 select id,day,register,operator,payload,created_at,updated_at from private.cash_closings
 where tenant_id=private.current_tenant() with local check option;
revoke all on public.shared_inventory,public.pending_receipts,public.cash_closings from public,anon,authenticated;

-- Insert the authenticated context at entry to every legacy data operation.
-- All calls overwrite the transaction setting; client supplied GUCs cannot select a tenant.
do $$
declare fn record; definition text; token_arg text;
begin
 for fn in select p.oid,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prolang=(select oid from pg_language where lanname='plpgsql')
 and (p.prosrc like '%public.shared_inventory%' or p.prosrc like '%public.pending_receipts%' or p.prosrc like '%public.cash_closings%')
 loop
  definition:=pg_get_functiondef(fn.oid);
  token_arg:=case when definition like '%p_session_token text%' then 'p_session_token' else 'p_token' end;
  definition:=regexp_replace(definition,'\m[Bb][Ee][Gg][Ii][Nn]\M', 'begin perform private.set_tenant_context('||token_arg||');');
  if fn.proname='cash_closing_save' then
   definition:=replace(definition,'insert into public.cash_closings','insert into private.cash_closings');
   definition:=replace(definition,'on conflict(day,register)','on conflict(tenant_id,day,register)');
  end if;
  execute definition;
 end loop;
end $$;

create function private.validate_membership_role() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.app_users u where u.id=new.user_id and u.role=new.role)
 then raise exception 'Papel de vínculo incompatível' using errcode='23514'; end if;
 return new;
end $$;
create trigger validate_membership_role before insert or update on private.tenant_memberships
for each row execute function private.validate_membership_role();
revoke all on function private.validate_membership_role() from public,anon,authenticated;

create function public.inventory_tenants(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 actor:=private.require_actor(p_token,true);
 return jsonb_build_object('role',actor.role,'mustChangePassword',actor.must_change_password,
 'user',jsonb_build_object('id',actor.id,'username',actor.username,'display_name',actor.display_name,'role',actor.role),
 'activeTenantId',(select tenant_id from private.app_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')),
 'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name)
 from private.establishments e join private.tenant_memberships m on m.tenant_id=e.id where m.user_id=actor.id and e.active),'[]'::jsonb));
end $$;
create function public.inventory_select_tenant(p_token text,p_tenant_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype; new_token text; expiry timestamptz:=now()+interval '12 hours';
begin
 actor:=private.require_actor(p_token);
 if not exists(select 1 from private.tenant_memberships m join private.establishments e on e.id=m.tenant_id
 where m.user_id=actor.id and m.tenant_id=p_tenant_id and m.role=actor.role and e.active)
 then raise exception 'Sem acesso à unidade' using errcode='42501'; end if;
 update private.app_sessions set revoked_at=now() where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 new_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into private.app_sessions(token_hash,user_id,expires_at,tenant_id)
 values(encode(extensions.digest(new_token,'sha256'),'hex'),actor.id,expiry,p_tenant_id);
 return jsonb_build_object('ok',true,'session_token',new_token,'expires_at',expiry);
end $$;

create function public.inventory_password_change(p_token text,p_current_password text,p_new_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 actor:=private.require_actor(p_token,true);
 if length(coalesce(p_new_password,''))<12 or octet_length(p_new_password)>72 or p_new_password=p_current_password
 then raise exception 'Use uma senha nova com 12 a 72 caracteres' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.username,0));
 if (select count(*) from private.app_login_attempts where username=actor.username and attempted_at>now()-interval '15 minutes')>=8
 then return jsonb_build_object('ok',false,'message','Muitas tentativas. Aguarde 15 minutos.'); end if;
 if actor.password_hash<>extensions.crypt(coalesce(p_current_password,''),actor.password_hash) then
  insert into private.app_login_attempts(username) values(actor.username);
  return jsonb_build_object('ok',false,'message','Senha atual inválida.');
 end if;
 update private.app_users set password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf',12)),must_change_password=false where id=actor.id;
 update private.app_sessions set revoked_at=now() where user_id=actor.id and token_hash<>encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null;
 delete from private.app_login_attempts where username=actor.username;
 return jsonb_build_object('ok',true);
end $$;

create function public.inventory_directory(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 actor:=private.require_actor(p_token);
 if actor.role not in ('admin','superadmin') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 return jsonb_build_object('establishments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name)
 from private.establishments e where e.active and (actor.role='superadmin' or exists(select 1 from private.tenant_memberships m where m.user_id=actor.id and m.tenant_id=e.id))),'[]'::jsonb),
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'displayName',u.display_name,'role',u.role,'active',u.active,
 'tenantIds',(select coalesce(jsonb_agg(m.tenant_id),'[]'::jsonb) from private.tenant_memberships m where m.user_id=u.id
 and (actor.role='superadmin' or exists(select 1 from private.tenant_memberships own where own.user_id=actor.id and own.tenant_id=m.tenant_id)))))
 from private.app_users u where u.role<>'superadmin' and (actor.role='superadmin' or exists(select 1 from private.tenant_memberships m join private.tenant_memberships own on own.tenant_id=m.tenant_id where own.user_id=actor.id and m.user_id=u.id))),'[]'::jsonb));
end $$;
create function public.inventory_establishment_create(p_token text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype; tid uuid;
begin
 actor:=private.require_actor(p_token);
 if actor.role not in ('admin','superadmin') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Nome inválido' using errcode='22023'; end if;
 insert into private.establishments(name) values(btrim(p_name)) returning id into tid;
 if actor.role='admin' then insert into private.tenant_memberships values(actor.id,tid,'admin'); end if;
 insert into private.tenant_inventory(tenant_id,id,state) values(tid,true,'{"products":[],"movements":[],"documents":[],"revision":0}'::jsonb);
 return jsonb_build_object('ok',true,'id',tid);
end $$;
create function public.inventory_user_create(p_token text,p_username text,p_display_name text,p_password text,p_role text,p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype; uid uuid;
begin
 actor:=private.require_actor(p_token);
 if actor.role not in ('admin','superadmin') or p_role not in ('admin','employee') or (actor.role='admin' and p_role<>'employee')
 then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 if not exists(select 1 from private.establishments e where e.id=p_tenant_id and e.active
 and (actor.role='superadmin' or exists(select 1 from private.tenant_memberships m where m.user_id=actor.id and m.tenant_id=e.id and m.role='admin')))
 then raise exception 'Sem acesso à unidade' using errcode='42501'; end if;
 if coalesce(p_username,'') !~ '^[a-z0-9][a-z0-9._-]{2,63}$' or length(btrim(coalesce(p_display_name,''))) not between 1 and 120
 or length(coalesce(p_password,''))<12 or octet_length(p_password)>72 then raise exception 'Cadastro inválido' using errcode='22023'; end if;
 insert into private.app_users(username,display_name,password_hash,role,must_change_password)
 values(p_username,btrim(p_display_name),extensions.crypt(p_password,extensions.gen_salt('bf',12)),p_role,true) returning id into uid;
 insert into private.tenant_memberships values(uid,p_tenant_id,p_role);
 return jsonb_build_object('ok',true,'id',uid);
end $$;
create function public.inventory_manager_grant(p_token text,p_user_id uuid,p_tenant_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 actor:=private.require_actor(p_token);
 if actor.role<>'superadmin' or not exists(select 1 from private.app_users where id=p_user_id and role='admin' and active)
 or not exists(select 1 from private.establishments where id=p_tenant_id and active)
 then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 insert into private.tenant_memberships values(p_user_id,p_tenant_id,'admin') on conflict do nothing;
 return jsonb_build_object('ok',true);
end $$;

-- Owner-only bootstrap: invoke with bind parameters through a protected database
-- connection with statement/parameter logging disabled. No browser RPC is created.
create function private.bootstrap_superadmin(p_username text,p_password_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare uid uuid;
begin
 if p_username<>'admin.master' or coalesce(p_password_hash,'') !~ '^\$2[aby]\$(1[2-5])\$[./A-Za-z0-9]{53}$'
 then raise exception 'Bootstrap inválido' using errcode='22023'; end if;
 if exists(select 1 from private.app_users where username=p_username or role='superadmin')
 then raise exception 'Bootstrap já realizado; preserve as credenciais existentes' using errcode='23505'; end if;
 insert into private.app_users(username,display_name,password_hash,role,must_change_password)
 values(p_username,'DBA',p_password_hash,'superadmin',true) returning id into uid;
 return uid;
end $$;

create function private.valid_supplier_cnpj(p_cnpj text) returns boolean language plpgsql immutable set search_path='' as $$
declare c text:=upper(regexp_replace(coalesce(p_cnpj,''),'[./[:space:]-]','','g')); total integer; digit integer; i integer; pass integer; weights integer[];
begin
 if c !~ '^[0-9]{14}$' or c=repeat(substr(c,1,1),14) then return false; end if;
 for pass in 1..2 loop
  weights:=case when pass=1 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;
  total:=0;
  for i in 1..array_length(weights,1) loop total:=total+substr(c,i,1)::integer*weights[i]; end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if digit<>substr(c,12+pass,1)::integer then return false; end if;
 end loop;
 return true;
end $$;
-- Reject conflicting supplier references before inventory_save changes any state.
create function private.validate_supplier_identity(p_state jsonb) returns void language plpgsql set search_path='' as $$
begin
 if exists(select 1 from jsonb_array_elements(coalesce(p_state->'suppliers','[]'::jsonb)) s
 where not private.valid_supplier_cnpj(s->>'cnpj'))
 or exists(select 1 from jsonb_array_elements(coalesce(p_state->'products','[]'::jsonb)) p,
 jsonb_array_elements(coalesce(p->'supplierCodes','[]'::jsonb)) c
 where coalesce(c->>'cnpj','')<>'' and not private.valid_supplier_cnpj(c->>'cnpj'))
 then raise exception 'CNPJ de fornecedor inválido ou alfanumérico ainda não suportado; confira o cadastro' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_state->'products','[]'::jsonb)) p,
 jsonb_array_elements(coalesce(p->'supplierCodes','[]'::jsonb)) c
 where coalesce(c->>'cnpj','')<>'' and coalesce(c->>'code','')<>''
 group by upper(regexp_replace(c->>'cnpj','[./[:space:]-]','','g')),btrim(c->>'code') having count(distinct p->>'id')>1)
 then raise exception 'Código de fornecedor vinculado a produtos diferentes; confira os cadastros' using errcode='23505'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_state->'suppliers','[]'::jsonb)) s
 where coalesce(s->>'cnpj','')<>'' group by upper(regexp_replace(s->>'cnpj','[./[:space:]-]','','g')) having count(*)>1)
 then raise exception 'CNPJ repetido no diretório de fornecedores' using errcode='23505'; end if;
end $$;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure);
 definition:=replace(definition,'update public.shared_inventory set state = p_state',
 'p_state:=p_state||jsonb_build_object(''suppliers'',coalesce(p_state->''suppliers'',existing_state->''suppliers'',''[]''::jsonb)); perform private.validate_supplier_identity(p_state); update public.shared_inventory set state = p_state');
 execute definition;
end $$;

-- Preserve the login response while attaching the initial unit and first-use gate.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.inventory_login_impl(text,text)'::regprocedure);
 definition:=regexp_replace(definition,'\m[Bb][Ee][Gg][Ii][Nn]\M',
  'begin perform pg_advisory_xact_lock(hashtextextended(normalized_username,0));');
 definition:=replace(definition,'insert into private.app_sessions(token_hash, user_id, expires_at)',
  'insert into private.app_sessions(token_hash, user_id, expires_at, tenant_id)');
 definition:=replace(definition,'user_row.id, expiry);',
  'user_row.id, expiry, (select m.tenant_id from private.tenant_memberships m join private.establishments e on e.id=m.tenant_id where m.user_id=user_row.id and e.active order by e.created_at,e.id limit 1));');
 definition:=replace(definition,'''role'', user_row.role);',
  '''role'', user_row.role, ''must_change_password'', user_row.must_change_password);');
 execute definition;
end $$;

create or replace function public.inventory_permissions_list(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 perform private.set_tenant_context(p_token);
 actor:=private.require_actor(p_token);
 return jsonb_build_object('self',(select jsonb_object_agg(k,private.has_permission(actor.id,k))
 from unnest(array['fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel']) k),
 'users',case when actor.role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
 'id',u.id,'name',u.display_name,'username',u.username,'role',u.role,'active',u.active,'permissions',(
 select jsonb_object_agg(k,private.has_permission(u.id,k)) from unnest(array['fiscal.pending.read','fiscal.pending.create','fiscal.pending.review','fiscal.pending.cancel']) k)))
 from private.app_users u join private.tenant_memberships m on m.user_id=u.id
 where m.tenant_id=private.current_tenant()),'[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Existing ACL storage is user scoped. Only single-unit employees may be changed
-- by a manager, preventing an ACL edit from affecting a different manager's unit.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.inventory_permission_set(text,uuid,text,boolean)'::regprocedure);
 definition:=regexp_replace(definition,'\m[Bb][Ee][Gg][Ii][Nn]\M',
 'begin perform private.set_tenant_context(p_token); if not exists(select 1 from private.tenant_memberships m where m.user_id=p_user_id and m.tenant_id=private.current_tenant() and m.role=''employee'') then raise exception ''Só é possível editar funcionários desta unidade'' using errcode=''42501''; end if;');
 execute definition;
end $$;

create or replace function private.inventory_validate_session_impl(p_session_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 actor:=private.require_actor(p_session_token);
 if actor.role='superadmin' then raise exception 'Operação indisponível ao DBA' using errcode='42501'; end if;
 if not exists(select 1 from private.app_sessions s join private.tenant_memberships m on m.user_id=s.user_id and m.tenant_id=s.tenant_id
 join private.establishments e on e.id=m.tenant_id and e.active
 where s.token_hash=encode(extensions.digest(p_session_token,'sha256'),'hex') and m.role=actor.role)
 then raise exception 'Sem acesso à unidade' using errcode='42501'; end if;
 return jsonb_build_object('valid',true,'user',jsonb_build_object('id',actor.id,'role',actor.role));
end $$;

-- Public forwarding functions execute as their trusted owner after private grants
-- are removed. They retain fixed search_path and always pass the supplied token.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p
 where p.pronamespace='public'::regnamespace and p.prosrc like '%private.inventory_%'
 loop execute format('alter function %s security definer',fn.signature); end loop;
end $$;

-- All private entry points are inaccessible through Data API, including former grants.
revoke all on all tables in schema private from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
alter table private.establishments enable row level security;
alter table private.tenant_memberships enable row level security;
do $$ declare fn record; begin
 for fn in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
 and proname in ('inventory_tenants','inventory_select_tenant','inventory_password_change','inventory_directory',
 'inventory_establishment_create','inventory_user_create','inventory_manager_grant') loop
 execute format('revoke all on function %s from public',fn.signature);
 execute format('grant execute on function %s to anon,authenticated',fn.signature);
 end loop;
end $$;
commit;
