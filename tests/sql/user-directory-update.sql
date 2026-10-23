-- Test user metadata updates only in disposable tenant-test PostgreSQL.
-- Fresh synthetic sessions ensure the test does not depend on earlier token state.
insert into private.app_users(username,password_hash,role,display_name,active)
values('qa.manager',extensions.crypt('synthetic-manager-password',extensions.gen_salt('bf',4)),'admin','Manager QA',true),
('qa.worker',extensions.crypt('synthetic-worker-password',extensions.gen_salt('bf',4)),'employee','Worker QA',true),
('qa.other',extensions.crypt('synthetic-other-password',extensions.gen_salt('bf',4)),'employee','Other QA',true);
insert into private.tenant_memberships(user_id,tenant_id,role)
select id,'00000000-0000-4000-8000-000000000001',role from private.app_users where username in ('qa.manager','qa.worker');
insert into private.establishments(id,name) values('00000000-0000-4000-8000-0000000000ed','Other Unit QA');
insert into private.tenant_memberships(user_id,tenant_id,role)
select id,'00000000-0000-4000-8000-0000000000ed','employee' from private.app_users where username='qa.other';
set role anon;
do $$
declare manager_token text; worker_token text; dba_token text; worker uuid; outsider uuid;
 result jsonb; before_hash text; before_audit bigint;
begin
 manager_token:=public.inventory_login('qa.manager','synthetic-manager-password')->>'session_token';
 worker_token:=public.inventory_login('qa.worker','synthetic-worker-password')->>'session_token';
 worker:=(select id from private.app_users where username='qa.worker');
 outsider:=(select id from private.app_users where username='qa.other');
 -- privileges: worker denied, cross-tenant denied, superadmin denied target.
 begin perform public.inventory_user_update(worker_token,worker,'qa.worker','worker',true);
  raise exception 'Employee escalated privileges'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_user_update(manager_token,outsider,'qa.other','outsider',true);
  raise exception 'Cross tenant edit accepted'; exception when insufficient_privilege then null; end;
 before_hash:=(select password_hash from private.app_users where id=worker);
 before_audit:=(select count(*) from private.app_user_edit_audit);
 result:=public.inventory_user_update(manager_token,worker,'QA.WORKER.RENAMED','Worker Renamed',true);
 assert result->>'changed'='true';
 assert (select username from private.app_users where id=worker)='qa.worker.renamed';
 assert (select password_hash from private.app_users where id=worker)=before_hash;
 assert (select count(*) from private.app_user_edit_audit)=before_audit+1;
 result:=public.inventory_user_update(manager_token,worker,'qa.worker.renamed','Worker Renamed',true);
 assert result->>'changed'='false';
 assert (select count(*) from private.app_user_edit_audit)=before_audit+1;
 begin perform public.inventory_user_update(manager_token,worker,'bad name!','Worker',true);
  raise exception 'Invalid login accepted'; exception when invalid_parameter_value then null; end;
 result:=public.inventory_user_update(manager_token,worker,'qa.worker.renamed','Worker Renamed',false);
 assert (result->>'ok')::boolean;
 assert (select active=false from private.app_users where id=worker);
 assert (select count(*) from private.app_sessions s where s.user_id=worker and s.revoked_at is null)=0;
 begin perform public.inventory_get(worker_token);
  raise exception 'Inactive account has valid session'; exception when invalid_authorization_specification then null; end;
end $$;
reset role;
