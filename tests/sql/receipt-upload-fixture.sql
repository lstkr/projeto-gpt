-- Dados e tokens fixos exclusivamente sintéticos de banco local descartável.
insert into private.establishments(id, name)
values ('00000000-0000-4000-8000-000000000002', 'Unidade sintética B');
insert into private.app_users(username, display_name, password_hash, role, active)
values ('upload.sender', 'Remetente sintético', 'fixture-sem-login', 'employee', true),
 ('upload.peer', 'Segundo remetente', 'fixture-sem-login', 'employee', true),
 ('upload.inactive', 'Inativo sintético', 'fixture-sem-login', 'employee', false),
 ('upload.denied', 'Sem permissão', 'fixture-sem-login', 'employee', true);
insert into private.tenant_memberships(user_id, tenant_id, role)
select id, case when username='upload.inactive' then
 '00000000-0000-4000-8000-000000000002'::uuid else
 '00000000-0000-4000-8000-000000000001'::uuid end, role from private.app_users;
-- Funcionário pertence a uma unidade: segundo remetente usa identidade distinta.
insert into private.app_users(username, display_name, password_hash, role)
values ('upload.other', 'Outro remetente', 'fixture-sem-login', 'employee');
insert into private.tenant_memberships(user_id, tenant_id, role)
select id, '00000000-0000-4000-8000-000000000002', role from private.app_users where username='upload.other';
insert into private.app_sessions(token_hash, user_id, tenant_id, expires_at, revoked_at)
select encode(extensions.digest(repeat(fixture.token,64),'sha256'),'hex'), actor.id,
 membership.tenant_id, now()+interval '1 hour', case when fixture.token='d' then now() end
from (values ('a','upload.sender'),('b','upload.other'),('c','upload.peer'),
 ('d','upload.sender'),('e','upload.inactive'),('f','upload.denied')) fixture(token, username)
join private.app_users actor on actor.username=fixture.username
join private.tenant_memberships membership on membership.user_id=actor.id;
insert into private.user_permissions(user_id, permission_key, allowed)
select id, permission_key, false from private.app_users
cross join unnest(array['fiscal.pending.create', 'fiscal.pending.read']) permission_key
where username='upload.denied';
