-- Synthetic fixtures only. Run after schema and all versioned migrations.
insert into private.app_users(username,password_hash,role,display_name) values
 ('sql.manager',extensions.crypt('synthetic-manager-only',extensions.gen_salt('bf',4)),'admin','Synthetic Manager');
insert into private.tenant_memberships select id,'00000000-0000-4000-8000-000000000001','admin'
from private.app_users where username='sql.manager';
select private.bootstrap_superadmin('admin.master',replace(extensions.crypt('synthetic-superadmin-only',extensions.gen_salt('bf',12)),'$2a$','$2b$'));
set role anon;
do $$
declare token text; old_token text; employee_token text; tenant uuid; pending uuid; result jsonb; state jsonb; dba_token text; i integer;
 manager_id uuid; employee_id uuid; state_revision bigint;
begin
 result:=public.inventory_login('admin.master','synthetic-superadmin-only'); dba_token:=result->>'session_token';
 assert (result->>'must_change_password')::boolean;
 begin perform public.inventory_directory(dba_token); raise exception 'DBA password gate bypass'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_external_rate_limit(dba_token,'qr'); raise exception 'DBA rate access bypass'; exception when insufficient_privilege then null; end;
 result:=public.inventory_password_change(dba_token,'synthetic-superadmin-only','synthetic-superadmin-changed'); assert (result->>'ok')::boolean;
 begin perform public.inventory_get(dba_token); raise exception 'DBA inventory bypass'; exception when insufficient_privilege then null; end;
 assert jsonb_typeof(public.inventory_directory(dba_token)->'users')='array';
 result:=public.inventory_login('sql.manager','synthetic-manager-only'); assert (result->>'ok')::boolean;
 token:=result->>'session_token';
 manager_id:=(public.inventory_tenants(token)->'user'->>'id')::uuid;
 state:=public.inventory_get(token);
 state:=state||jsonb_build_object(
  'revision',coalesce((state->>'revision')::bigint,0),
  'products',jsonb_build_array(jsonb_build_object('id','a','name','Tenant A','stock',1,'cost',1,'min',0,'unit','un'))||coalesce(state->'products','[]'::jsonb),
  'documents',jsonb_build_array(jsonb_build_object('id','fixture-manager-doc','checkedBy','Forged name','checkedByUserId','00000000-0000-4000-8000-000000000099','checkedByTenantId','00000000-0000-4000-8000-000000000099','checkedByAt','1900-01-01T00:00:00Z','checkedByVerified',false)),
  'movements',jsonb_build_array(jsonb_build_object('id','fixture-manager-move','documentId','fixture-manager-doc','by','Forged name','byUserId','00000000-0000-4000-8000-000000000099','byTenantId','00000000-0000-4000-8000-000000000099','byAt','1900-01-01T00:00:00Z','byVerified',false)));
 result:=public.inventory_save(token,state); assert (result->>'ok')::boolean;
 state:=public.inventory_get(token);
 assert state->'documents'->0->>'checkedBy'='Synthetic Manager';
 assert (state->'documents'->0->>'checkedByUserId')::uuid=manager_id;
 assert state->'documents'->0->>'checkedByTenantId'='00000000-0000-4000-8000-000000000001';
 assert state->'documents'->0->>'checkedByVerified'='true';
 assert state->'documents'->0->>'checkedByAt'<>'1900-01-01T00:00:00Z';
 assert state->'movements'->0->>'by'='Synthetic Manager';
 assert (state->'movements'->0->>'byUserId')::uuid=manager_id;
 assert state->'movements'->0->>'byTenantId'='00000000-0000-4000-8000-000000000001';
 assert state->'movements'->0->>'byVerified'='true';
 begin perform 1 from private.fiscal_document_attribution; raise exception 'Private fiscal audit was readable'; exception when insufficient_privilege then null; end;
 -- A retry after the committed revision keeps the first server attribution.
 result:=public.inventory_save(token,state); assert (result->>'ok')::boolean;
 state:=public.inventory_get(token);
 assert state->'documents'->0->>'checkedBy'='Synthetic Manager';
 result:=public.inventory_establishment_create(token,'Tenant B'); tenant:=(result->>'id')::uuid;
 old_token:=token; result:=public.inventory_select_tenant(token,tenant); token:=result->>'session_token';
 assert token<>old_token;
 begin perform public.inventory_get(old_token); raise exception 'Old token accepted'; exception when invalid_authorization_specification then null; end;
 assert jsonb_array_length(public.inventory_get(token)->'products')=0;
 result:=public.cash_closing_save(token,'{"day":"2026-10-21","register":"01","operator":"Synthetic","cashCounted":"0.00","createdBy":{"id":"spoofed","displayName":"Spoofed"},"movements":[]}'::jsonb);
 assert (result->>'ok')::boolean;
 assert result->'createdBy'->>'displayName'='Synthetic Manager';
 assert public.cash_closings_list(token)->0->'createdBy'->>'displayName'='Synthetic Manager';
 begin
  perform public.cash_closing_save(token,'{"day":"2026-10-22","register":"01","operator":"Synthetic","movements":[]}'::jsonb);
  raise exception 'Cash count was not required' using errcode='XX000';
 exception when sqlstate '22023' then null; end;
 result:=public.pending_receipt_create(token,'fixture.png','image/png','eA==','{}'::jsonb); pending:=(result->>'id')::uuid;
 result:=public.inventory_user_create(token,'sql.employee','Synthetic Employee','synthetic-employee-only','employee',tenant);
 assert (result->>'ok')::boolean;
 employee_id:=(result->>'id')::uuid;
 result:=public.inventory_login('sql.employee','synthetic-employee-only'); employee_token:=result->>'session_token';
 assert (result->>'must_change_password')::boolean;
 begin perform public.inventory_get(employee_token); raise exception 'Password gate bypassed'; exception when insufficient_privilege then null; end;
 result:=public.inventory_password_change(employee_token,'synthetic-employee-only','synthetic-new-password'); assert (result->>'ok')::boolean;
 state:=public.inventory_get(employee_token);
 state:=state||jsonb_build_object(
  'revision',coalesce((state->>'revision')::bigint,0),
  'documents',jsonb_build_array(jsonb_build_object('id','fixture-employee-doc','checkedBy','Forged employee')),
  'movements',jsonb_build_array(jsonb_build_object('id','fixture-employee-move','documentId','fixture-employee-doc','by','Forged employee')));
 result:=public.inventory_save(employee_token,state); assert (result->>'ok')::boolean;
 state:=public.inventory_get(employee_token);
 assert state->'documents'->0->>'checkedBy'='Synthetic Employee';
 assert (state->'documents'->0->>'checkedByUserId')::uuid=employee_id;
 assert state->'documents'->0->>'checkedByTenantId'=tenant::text;
 assert state->'movements'->0->>'by'='Synthetic Employee';
 assert (state->'movements'->0->>'byUserId')::uuid=employee_id;
 assert state->'movements'->0->>'byTenantId'=tenant::text;
 result:=public.inventory_user_update(token,employee_id,'sql.employee','Renamed Employee',true);
 assert (result->>'ok')::boolean;
 state:=public.inventory_get(token);
 assert state->'documents'->0->>'checkedBy'='Synthetic Employee';
 result:=public.inventory_permission_set(token,employee_id,'fiscal.pending.review',false);
 assert (result->>'ok')::boolean;
 state:=public.inventory_get(employee_token);
 state_revision:=(state->>'revision')::bigint;
 state:=state||jsonb_build_object(
  'documents',coalesce(state->'documents','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','fixture-denied-doc','checkedBy','Forged')),
  'movements',coalesce(state->'movements','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','fixture-denied-move','documentId','fixture-denied-doc','by','Forged')));
 begin
  perform public.inventory_save(employee_token,state);
  raise exception 'Fiscal document was saved without review permission' using errcode='XX000';
 exception when insufficient_privilege then null; end;
 assert (public.inventory_get(employee_token)->>'revision')::bigint=state_revision;
 assert not exists (select 1 from jsonb_array_elements(public.inventory_get(employee_token)->'documents') doc where doc->>'id'='fixture-denied-doc');
 begin
  perform public.inventory_save('invalid-session-token',state);
  raise exception 'Invalid session accepted fiscal save' using errcode='XX000';
 exception when invalid_authorization_specification then null; end;
 begin
  perform public.cash_closing_save(employee_token,'{"day":"2026-10-21","register":"01 ","operator":"Synthetic Employee","cashCounted":"0","movements":[]}'::jsonb);
  raise exception 'Employee overwrote a registered cash close' using errcode='XX000';
 exception when insufficient_privilege then null; end;
 result:=public.cash_closing_save(employee_token,'{"day":"2026-10-21","register":"02 ","operator":"Synthetic Employee","cashCounted":"0","movements":[]}'::jsonb);
 assert result->'createdBy'->>'displayName'='Renamed Employee';
 result:=public.cash_closing_save(token,'{"day":"2026-10-21","register":"02","operator":"Corrected","cashCounted":"0","movements":[]}'::jsonb);
 assert result->'createdBy'->>'displayName'='Renamed Employee';
 assert result->'updatedBy'->>'displayName'='Synthetic Manager';
 for i in 1..8 loop
  result:=public.inventory_password_change(employee_token,'incorrect-password','synthetic-other-new-password');
  assert not (result->>'ok')::boolean;
 end loop;
 result:=public.inventory_password_change(employee_token,'synthetic-new-password','synthetic-other-new-password');
 assert not (result->>'ok')::boolean and result->>'message' like 'Muitas tentativas%';
 begin perform public.inventory_select_tenant(employee_token,'00000000-0000-4000-8000-000000000001'); raise exception 'Employee tenant bypass'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_directory(employee_token); raise exception 'Employee directory bypass'; exception when insufficient_privilege then null; end;
 begin perform public.inventory_user_create(token,'sql.escalation','Escalation','synthetic-escalation','admin',tenant); raise exception 'Manager escalated role'; exception when insufficient_privilege then null; end;
 result:=public.inventory_select_tenant(token,'00000000-0000-4000-8000-000000000001'); token:=result->>'session_token';
 state:=public.inventory_get(token);
 assert state->'products'->0->>'id'='a';
 assert state->'documents'->0->>'id'='fixture-manager-doc';
 assert not exists (select 1 from jsonb_array_elements(state->'documents') doc where doc->>'id'='fixture-employee-doc');
 assert public.cash_closings_list(token)='[]'::jsonb;
 assert public.pending_receipts_list(token)='[]'::jsonb;
 assert public.pending_receipt_file(token,pending)='{}'::jsonb;
 begin perform public.pending_receipt_save(token,pending,'{}'::jsonb,1); raise exception 'Cross tenant pending write unexpectedly accepted' using errcode='XX000'; exception when sqlstate '22023' then null; end;
 begin perform public.pending_receipt_cancel(token,pending); raise exception 'Cross tenant pending cancel unexpectedly accepted' using errcode='XX000'; exception when sqlstate '22023' then null; end;
 result:=public.cash_closing_save(token,'{"day":"2026-10-21","register":"01","operator":"Synthetic","cashCounted":"0.00","movements":[]}'::jsonb);
 assert (result->>'ok')::boolean;
 assert jsonb_array_length(public.cash_closings_list(token))=1;
 begin perform private.inventory_get_impl(token); raise exception 'Private grant bypass'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.shared_inventory; raise exception 'Direct table grant bypass'; exception when insufficient_privilege then null; end;
end $$;
reset role;

