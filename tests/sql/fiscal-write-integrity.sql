-- Tests are run ONLY against an empty, disposable estoque_rpc_test database.
insert into private.app_users(id,username,password_hash,role,display_name,active)
values
 ('00000000-0000-4000-8000-0000000000a1','fiscal_admin','unused','admin','Fiscal Admin',true),
 ('00000000-0000-4000-8000-0000000000b1','fiscal_employee','unused','employee','Fiscal Employee',true);
insert into private.app_sessions(token_hash,user_id,expires_at)
values
 (encode(extensions.digest(repeat('a',64),'sha256'),'hex'),'00000000-0000-4000-8000-0000000000a1',now()+interval '1 hour'),
 (encode(extensions.digest(repeat('b',64),'sha256'),'hex'),'00000000-0000-4000-8000-0000000000b1',now()+interval '1 hour');
insert into private.user_permissions(user_id,permission_key,allowed)
values ('00000000-0000-4000-8000-0000000000b1','fiscal.pending.review',false);

insert into public.pending_receipts(id,owner_id,file_name,mime,file_bytes,draft)
select v.id::uuid,'00000000-0000-4000-8000-0000000000a1',v.name,'',decode('74657374','hex'),'{}'::jsonb
from (values
 ('00000000-0000-4000-8000-0000000000c1','first.xml'),
 ('00000000-0000-4000-8000-0000000000c2','cancel.xml'),
 ('00000000-0000-4000-8000-0000000000c3','post-race.xml'),
 ('00000000-0000-4000-8000-0000000000c4','cancel-race.xml'),
 ('00000000-0000-4000-8000-0000000000c5','duplicate.xml')
) v(id,name);

set role anon;
do $tests$
declare
 admin_token text:=repeat('a',64);
 employee_token text:=repeat('b',64);
 empty_state jsonb:='{"products":[],"movements":[],"documents":[],"revision":0}'::jsonb;
 posted_state jsonb;
 result jsonb;
begin
 -- Missing, null and malformed revisions must never be treated as equal.
 begin
  perform public.inventory_save(admin_token,empty_state-'revision');
  raise exception 'missing revision accepted';
 exception when sqlstate '40001' then null; end;
 begin
  perform public.inventory_save(admin_token,jsonb_set(empty_state,'{revision}','null'::jsonb));
  raise exception 'null inventory revision accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.inventory_save(admin_token,jsonb_set(empty_state,'{revision}','"broken"'::jsonb));
  raise exception 'malformed inventory revision accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.inventory_count_settings(admin_token,
   '{"enabled":true,"mode":"interval","intervalDays":7,"weekday":1,"monthDay":1}'::jsonb,null);
  raise exception 'null count settings revision accepted';
 exception when sqlstate '40001' then null; end;
 begin
  perform public.inventory_count_complete(admin_token,'[]'::jsonb,null);
  raise exception 'null count completion revision accepted';
 exception when sqlstate '40001' then null; end;
 begin
  perform public.pending_receipt_save(admin_token,'00000000-0000-4000-8000-0000000000c1','{}'::jsonb,null);
  raise exception 'null pending receipt revision accepted';
 exception when sqlstate '22023' then null; end;

 -- A caller denied fiscal review permission cannot bypass the ACL through
 -- public.inventory_save or by adding an invoice-linked movement.
 posted_state:=jsonb_set(empty_state,'{documents}',jsonb_build_array(
   jsonb_build_object('id','forbidden-doc','pendingReceiptId','00000000-0000-4000-8000-0000000000c1')));
 begin
  perform public.inventory_save(employee_token,posted_state);
  raise exception 'employee bypassed fiscal review ACL';
 exception when sqlstate '42501' then null; end;
 begin
  perform public.inventory_save(employee_token,jsonb_set(empty_state,'{movements}',
   '[{"id":"forbidden-movement","documentId":"fake-invoice"}]'::jsonb));
  raise exception 'employee inserted fiscal movement without permission';
 exception when sqlstate '42501' then null; end;
 -- No direct inventory read is possible via the anon Data API role.
 begin
  perform state from public.shared_inventory;
  raise exception 'anon read inventory table';
 exception when insufficient_privilege then null; end;

 -- Authorized reviewer commits BOTH the stock snapshot and pending state.
 posted_state:=jsonb_set(empty_state,'{documents}',jsonb_build_array(
   jsonb_build_object('id','initial-doc','pendingReceiptId','00000000-0000-4000-8000-0000000000c1')));
 result:=public.inventory_save(admin_token,posted_state);
 assert result->>'revision'='1', 'revision increment missing';
 result:=public.pending_receipt_mark_posted(admin_token,'00000000-0000-4000-8000-0000000000c1');
 assert result->>'ok'='true', 'legacy marker must be idempotent';
 begin
  perform public.pending_receipt_cancel(admin_token,'00000000-0000-4000-8000-0000000000c1');
  raise exception 'posted invoice cancelled';
 exception when sqlstate '22023' then null; end;

 -- No posting of already-cancelled receipts or repeat documents.
 result:=public.pending_receipt_cancel(admin_token,'00000000-0000-4000-8000-0000000000c2');
 assert result->>'ok'='true', 'cancel of unposted note failed';
 begin
  perform public.inventory_save(admin_token,
   jsonb_build_object('products','[]'::jsonb,'movements','[]'::jsonb,
   'documents',jsonb_build_array(
     jsonb_build_object('id','initial-doc','pendingReceiptId','00000000-0000-4000-8000-0000000000c1'),
     jsonb_build_object('id','cancelled-doc','pendingReceiptId','00000000-0000-4000-8000-0000000000c2')),
   'revision',1));
  raise exception 'cancelled receipt posted';
 exception when sqlstate '40001' then null; end;
 begin
  perform public.inventory_save(admin_token,
   jsonb_build_object('products','[]'::jsonb,'movements','[]'::jsonb,
   'documents',jsonb_build_array(
     jsonb_build_object('id','initial-doc','pendingReceiptId','00000000-0000-4000-8000-0000000000c1'),
     jsonb_build_object('id','duplicate-doc','pendingReceiptId','00000000-0000-4000-8000-0000000000c1')),
   'revision',1));
  raise exception 'duplicate pending document accepted';
 exception when sqlstate '23505' then null; end;
end;
$tests$;
reset role;

do $verify$
begin
 assert (select state='posted' from public.pending_receipts where id='00000000-0000-4000-8000-0000000000c1');
 assert (select state='cancelled' and file_bytes is null from public.pending_receipts where id='00000000-0000-4000-8000-0000000000c2');
 assert (select (state->>'revision')::bigint=1 from public.shared_inventory where id=true);
 assert (select jsonb_array_length(state->'documents')=1 from public.shared_inventory where id=true);
 assert (select state='pending' from public.pending_receipts where id='00000000-0000-4000-8000-0000000000c3');
end;
$verify$;
