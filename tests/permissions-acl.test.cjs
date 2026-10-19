const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const acl=fs.readFileSync('db/access-permissions.sql','utf8');
const pending=fs.readFileSync('db/pending-receipts.sql','utf8');
const page=fs.readFileSync('pages/index.js','utf8');

test('acl is deny-by-default for unknown permissions and inactive users',()=>{
 assert.match(acl,/else false end/);
 assert.match(acl,/where u.id=p_user and u.active/);
 assert.match(acl,/revoke all on private.user_permissions/);
 assert.match(acl,/enable row level security/);
});
test('user cannot grant own permissions and role is validated in SQL',()=>{
 assert.match(acl,/actor.role<>'admin'/);
 assert.match(acl,/p_key='fiscal.pending.cancel'[\s\S]*?p_allowed and not exists/);
 assert.match(acl,/role='admin'/);
 assert.match(acl,/insert into private.permission_audit/);
});
test('pending receipt RPCs enforce server-side permission checks',()=>{
 for(const [name,permission] of Object.entries({
  pending_receipts_list:'fiscal.pending.read',
  pending_receipt_create:'fiscal.pending.create',
  pending_receipt_save:'fiscal.pending.review',
  pending_receipt_file:'fiscal.pending.read',
  pending_receipt_mark_posted:'fiscal.pending.review'
 })){
  const start=pending.indexOf('create or replace function public.'+name+'(');
  assert.ok(start>=0,name+' function missing');
  const body=pending.slice(start,pending.indexOf('$function$;',start));
  assert.ok(body.includes("private.has_permission(uid,'"+permission+"')"),name+' missing server permission');
 }
 const start=pending.indexOf('create or replace function public.pending_receipt_cancel(');
 const body=pending.slice(start,pending.indexOf('$function$;',start));
 assert.match(body,/actor_role is distinct from 'admin' or not private.has_permission\(actor_id,'fiscal.pending.cancel'\)/);
});
test('admin configuration uses server-derived identity and audit trail',()=>{
 assert.match(acl,/join private.app_users u on u.id=s.user_id/);
 assert.match(acl,/s.expires_at>now\(\) and s.revoked_at is null and u.active/);
 assert.match(acl,/insert into private.permission_audit/);
});
test('frontend permissions come from server and cannot substitute for authorization',()=>{
 assert.match(page,/supabase.rpc\('inventory_permissions_list'/);
 assert.match(page,/supabase.rpc\('inventory_permission_set'/);
 assert.match(page,/canFiscal\('fiscal.pending.cancel'\)/);
});
