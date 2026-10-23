-- Test user metadata updates only in disposable tenant-test PostgreSQL.
-- Fresh synthetic sessions ensure the test does not depend on earlier token state.
insert into private.app_users(id,username,password_hash,role,display_name,active)
values('00000000-0000-4000-8000-0000000000fa','qa.manager',extensions.crypt('synthetic-manager-password',extensions.gen_salt('bf',4)),'admin','Manager QA',true),
('00000000-0000-4000-8000-0000000000fb','qa.worker',extensions.crypt('synthetic-worker-password',extensions.gen_salt('bf',4)),'employee','Worker QA',true),
('00000000-0000-4000-8000-0000000000fe','qa.other',extensions.crypt('synthetic-other-password',extensions.gen_salt('bf',4)),'employee','Other QA',true);
insert into private.tenant_memberships(user_id,tenant_id,role)
select id,'00000000-0000-4000-8000-000000000001',role from private.app_users where username in ('qa.manager','qa.worker');
insert into private.establishments(id,name) values('00000000-0000-4000-8000-0000000000ed','Other Unit QA');
insert into private.tenant_memberships(user_id,tenant_id,role)
select id,'00000000-0000-4000-8000-0000000000ed','employee' from private.app_users where username='qa.other';
insert into private.establishments(id,name) values('00000000-0000-4000-8000-0000000000ef','Exclusive QA');
insert into private.tenant_memberships(user_id,tenant_id,role)
select id,'00000000-0000-4000-8000-0000000000ef','admin' from private.app_users where username='qa.manager';
-- Cross-tenant target ID is explicitly selected before privilege downgrade using a fixture helper.
set role anon;
do $$
declare manager_token text; worker_token text; worker uuid; outsider uuid;
 result jsonb;
begin
 manager_token:=public.inventory_login('qa.manager','synthetic-manager-password')->>'session_token';
 worker_token:=public.inventory_login('qa.worker','synthetic-worker-password')->>'session_token';
 select (entry->>'id')::uuid into worker from jsonb_array_elements(public.inventory_directory(manager_token)->'users') entry
 where entry->>'username'='qa.worker';
 if worker is null then raise exception 'Fixture worker not visible'; end if;
 outsider:='00000000-0000-4000-8000-0000000000fe'::uuid;
 -- privileges: worker denied, cross-tenant denied, superadmin denied target.
 begin perform public.inventory_user_update(worker_token,worker,'qa.worker','worker',true);
  raise exception 'Employee escalated privileges'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_user_update(manager_token,outsider,'qa.other','outsider',true);
  raise exception 'Cross tenant edit accepted'; exception when insufficient_privilege then null; end;
 -- A DBA cannot deactivate the last manager of an establishment.
 begin
  perform public.inventory_user_update(
   public.inventory_login('admin.master','synthetic-superadmin-changed')->>'session_token',
   '00000000-0000-4000-8000-0000000000fa'::uuid,
   'qa.manager','Manager QA',false);
  raise exception 'Last manager deactivation accepted';
 exception when insufficient_privilege then null; end;
 result:=public.inventory_user_update(manager_token,worker,'QA.WORKER.RENAMED','Worker Renamed',true);
 assert result->>'changed'='true';
 assert (public.inventory_directory(manager_token)->>'users') is not null;
 result:=public.inventory_user_update(manager_token,worker,'qa.worker.renamed','Worker Renamed',true);
 assert result->>'changed'='false';
 begin perform public.inventory_user_update(manager_token,worker,'bad name!','Worker',true);
  raise exception 'Invalid login accepted'; exception when invalid_parameter_value then null; end;
 result:=public.inventory_user_update(manager_token,worker,'qa.worker.renamed','Worker Renamed',false);
 assert (result->>'ok')::boolean;
 begin perform public.inventory_get(worker_token);
  raise exception 'Inactive account has valid session'; exception when invalid_authorization_specification then null; end;
end $$;
reset role;
-- Privileged assertions are deliberately outside the anon session: RLS stays closed.
do $$
declare worker private.app_users%rowtype;
begin
 select * into worker from private.app_users where username='qa.worker.renamed';
 assert found and worker.display_name='Worker Renamed' and not worker.active;
 assert worker.password_hash=extensions.crypt('synthetic-worker-password',worker.password_hash);
 assert (select count(*) from private.app_user_edit_audit where target_id=worker.id)=2;
 assert (select count(*) from private.app_sessions where user_id=worker.id and revoked_at is null)=0;
end $$;

