import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
process.on('uncaughtException', error => { console.error('FAIL',error.message,error.where??'');process.exit(1); });

// Supply an installed @electric-sql/pglite directory; no remote database is used.
const runtime = process.env.PGLITE_MODULE_PATH;
if (!runtime) throw new Error('PGLITE_MODULE_PATH is required');
const { PGlite } = await import(pathToFileURL(path.join(runtime, 'dist/index.js')));
const { pgcrypto } = await import(pathToFileURL(path.join(runtime, 'dist/contrib/pgcrypto.js')));
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create role anon; create role authenticated; create schema extensions;');
await db.exec(`create schema auth; create table auth.users(id uuid primary key);
 insert into auth.users values ('00000000-0000-4000-8000-0000000000a1');
 create schema storage; create table storage.buckets(id text primary key); create table storage.objects(id uuid primary key);
 insert into storage.buckets values ('fixture-bucket'); insert into storage.objects values ('00000000-0000-4000-8000-0000000000a2');`);
for (const file of ['db/schema.sql','db/access-permissions.sql','db/pending-receipts.sql','db/cash-closing.sql',
 'supabase/migrations/20261019201520_inventory_validate_session.sql',
 'supabase/migrations/20261020221500_fiscal_write_integrity.sql',
 'supabase/migrations/20261021143000_external_fiscal_rate_limit.sql',
 'supabase/migrations/20261021232050_tenant_access.sql',
 'supabase/migrations/20261021233206_count_guard_search_path.sql',
 'supabase/migrations/20261022020602_cash_closing_integrity.sql']) {
 try {
  const source=await fs.readFile(file,'utf8');
  if(file.endsWith('_tenant_access.sql')) {
   await db.exec("insert into private.app_users(username,password_hash,role,display_name) values ('recovery.fixture',extensions.crypt('synthetic-recovery-password',extensions.gen_salt('bf',4)),'admin','Recovery Fixture')");
   const before=(await db.query("select password_hash from private.app_users where username='recovery.fixture'")).rows[0].password_hash;
   await assert.rejects(()=>db.exec(source.replace(/commit;\s*$/i,()=>"do $$ begin raise exception 'injected cutover failure'; end $$; commit;")),/injected cutover failure/);
   await db.exec('rollback;');
   assert.equal((await db.query("select password_hash from private.app_users where username='recovery.fixture'")).rows[0].password_hash,before);
   assert.equal((await db.query("select to_regclass('private.establishments') result")).rows[0].result,null);
   assert.notEqual((await db.query("select to_regclass('public.shared_inventory') result")).rows[0].result,null);
   console.log('PASS injected cutover failure rolls back schema and preserves credentials');
  }
  await db.exec(source); console.log('APPLIED',file);
 }
 catch(error) { console.error('FAILED',file,error.message,error.detail??'',error.where??'');process.exit(1); }
}
const guardPath=(await db.query("select coalesce((select array_to_string(proconfig,',') from pg_proc where oid=to_regprocedure('private.count_guard()')),'absent') config")).rows[0].config;
assert(guardPath==='absent'||guardPath.includes('search_path=""'));
const scalar = async (sql, args=[]) => (await db.query(sql,args)).rows[0].result;
await db.exec(`insert into private.app_users(username,password_hash,role,display_name) values
 ('test.manager',extensions.crypt('test-only-manager-password',extensions.gen_salt('bf',4)),'admin','Test Manager');
 insert into private.tenant_memberships select id,'00000000-0000-4000-8000-000000000001','admin' from private.app_users where username='test.manager';`);
await db.exec('set role anon;');
const login=await scalar('select public.inventory_login($1,$2) result',['test.manager','test-only-manager-password']);
assert.equal(login.ok,true);
let token=login.session_token;
const first=await scalar('select public.inventory_get($1) result',[token]);
assert.deepEqual(first.products,[]);
const tenant=await scalar('select public.inventory_establishment_create($1,$2) result',[token,'Second Unit']);
first.products=[{id:'test-product',name:'First tenant only',stock:3,cost:2,min:0,unit:'un'}];
first.revision=0;
assert.equal((await scalar('select public.inventory_save($1,$2::jsonb) result',[token,JSON.stringify(first)])).ok,true);
const switched=await scalar('select public.inventory_select_tenant($1,$2) result',[token,tenant.id]);
assert.notEqual(switched.session_token,token);
await assert.rejects(()=>scalar('select public.inventory_get($1) result',[token]),/Sessão inválida|Sessao invalida/);
token=switched.session_token;
assert.deepEqual((await scalar('select public.inventory_get($1) result',[token])).products,[]);
const cash={day:'2026-10-21',register:'01',operator:'Test',cashCounted:'0.00',cashReviewed:true,
 movements:[{type:'sangria',amount:'10.00',reason:'SANGRIA - FECHAMENTO DE CAIXA'}],
 createdBy:{id:'spoofed',displayName:'Spoofed'},id:'spoofed'};
const savedCash=await scalar('select public.cash_closing_save($1,$2::jsonb) result',[token,JSON.stringify(cash)]);
assert.equal(savedCash.ok,true);
assert.equal(savedCash.createdBy.displayName,'Test Manager');
assert.equal(savedCash.updatedBy.displayName,'Test Manager');
const listedCash=await scalar('select public.cash_closings_list($1) result',[token]);
assert.equal(listedCash.length,1);
assert.equal(listedCash[0].createdBy.displayName,'Test Manager');
assert.equal(listedCash[0].movements.length,0);
for(const value of [undefined,'',null,'-1','1.234']) {
 const invalid={...cash};
 if(value===undefined)delete invalid.cashCounted;else invalid.cashCounted=value;
 await assert.rejects(()=>scalar('select public.cash_closing_save($1,$2::jsonb) result',[token,JSON.stringify(invalid)]),/dinheiro contado|Fechamento inválido|Valor de faturamento inválido/i);
}
const pending=await scalar('select public.pending_receipt_create($1,$2,$3,$4,$5::jsonb) result',[
 token,'fixture.png','image/png','eA==','{}']);
assert.equal(pending.ok,true);
const employee=await scalar('select public.inventory_user_create($1,$2,$3,$4,$5,$6) result',[
 token,'test.employee','Test Employee','test-only-employee-password','employee',tenant.id]);
assert.equal(employee.ok,true);
let employeeLogin=await scalar('select public.inventory_login($1,$2) result',['test.employee','test-only-employee-password']);
assert.equal(employeeLogin.must_change_password,true);
await assert.rejects(()=>scalar('select public.inventory_get($1) result',[employeeLogin.session_token]),/Troque sua senha/);
assert.equal((await scalar('select public.inventory_password_change($1,$2,$3) result',[
 employeeLogin.session_token,'test-only-employee-password','test-only-replaced-password'])).ok,true);
await assert.rejects(()=>scalar('select public.cash_closing_save($1,$2::jsonb) result',[
 employeeLogin.session_token,JSON.stringify({...cash,register:'01 '})]),/Somente o Gestor pode alterar/);
const employeeCash={day:'2026-10-21',register:'02 ',operator:'Test Employee',cashCounted:'0.00',movements:[]};
const employeeSaved=await scalar('select public.cash_closing_save($1,$2::jsonb) result',[
 employeeLogin.session_token,JSON.stringify(employeeCash)]);
assert.equal(employeeSaved.createdBy.displayName,'Test Employee');
const managerCorrection=await scalar('select public.cash_closing_save($1,$2::jsonb) result',[
 token,JSON.stringify({...employeeCash,register:'02',operator:'Corrected'})]);
assert.equal(managerCorrection.createdBy.displayName,'Test Employee');
assert.equal(managerCorrection.updatedBy.displayName,'Test Manager');
assert.equal((await scalar('select public.cash_closings_list($1) result',[token])).length,2);
await assert.rejects(()=>scalar('select public.inventory_directory($1) result',[employeeLogin.session_token]),/Operação não autorizada/);
await assert.rejects(()=>scalar('select public.inventory_select_tenant($1,$2) result',[
 employeeLogin.session_token,'00000000-0000-4000-8000-000000000001']),/Sem acesso/);
await assert.rejects(()=>scalar('select public.inventory_user_create($1,$2,$3,$4,$5,$6) result',[
 token,'test.escalation','Escalation','test-only-other-password','admin',tenant.id]),/Operação não autorizada/);
const back=await scalar('select public.inventory_select_tenant($1,$2) result',[
 token,'00000000-0000-4000-8000-000000000001']);
assert.equal((await scalar('select public.inventory_get($1) result',[back.session_token])).products[0].id,'test-product');
const correctedCash=await scalar('select public.cash_closing_save($1,$2::jsonb) result',[
 back.session_token,JSON.stringify({...cash,register:'01',createdBy:{id:'spoofed',displayName:'Spoofed'}})]);
assert.equal(correctedCash.createdBy.displayName,'Test Manager');
assert.equal(correctedCash.updatedBy.displayName,'Test Manager');
assert.deepEqual(await scalar('select public.cash_closings_list($1) result',[back.session_token]),[]);
assert.deepEqual(await scalar('select public.pending_receipts_list($1) result',[back.session_token]),[]);
assert.deepEqual(await scalar('select public.pending_receipt_file($1,$2) result',[back.session_token,pending.id]),{});
const collision={products:[{id:'a',supplierCodes:[{cnpj:'11222333000181',code:'0001'}]},
 {id:'b',supplierCodes:[{cnpj:'11222333000181',code:'0001'}]}],documents:[],movements:[],revision:0};
collision.revision=(await scalar('select public.inventory_get($1) result',[back.session_token])).revision;
await assert.rejects(()=>scalar('select public.inventory_save($1,$2::jsonb) result',[
 back.session_token,JSON.stringify(collision)]),/Código de fornecedor/);
await db.exec('set role anon;');
await assert.rejects(()=>db.query('select private.inventory_get_impl($1)',[back.session_token]),/permission denied/);
await assert.rejects(()=>db.query('select * from public.shared_inventory'),/permission denied/);
assert.equal((await scalar('select public.inventory_get($1) result',[back.session_token])).products.length,1);
await db.exec('reset role;');
await db.exec(await fs.readFile('tests/sql/tenant-access.sql','utf8'));
const operationalBefore=JSON.stringify((await db.query('select tenant_id,state from private.tenant_inventory order by tenant_id')).rows);
const credentialsBefore=JSON.stringify((await db.query('select id,password_hash from private.app_users order by id')).rows);
await db.exec(await fs.readFile('db/operations/backup-test-reset.sql','utf8'));
await db.exec(await fs.readFile('db/operations/reset-test-data.sql','utf8'));
assert.equal((await db.query("select count(*)::integer count from private.tenant_inventory where jsonb_array_length(state->'products')>0")).rows[0].count,0);
await db.exec(await fs.readFile('db/operations/restore-test-data.sql','utf8'));
assert.equal(JSON.stringify((await db.query('select tenant_id,state from private.tenant_inventory order by tenant_id')).rows),operationalBefore);
assert.equal(JSON.stringify((await db.query('select id,password_hash from private.app_users order by id')).rows),credentialsBefore);
assert.equal((await db.query('select count(*)::integer count from private.app_sessions where revoked_at is null')).rows[0].count,0);
console.log('PASS private backup, operational reset and restore rehearsal; credentials preserved; sessions revoked');
await db.exec(await fs.readFile('db/operations/reset-test-environment.sql','utf8'));
for (const table of ['app_users','establishments','tenant_memberships','app_sessions','app_login_attempts','tenant_inventory','cash_closings','pending_receipts','user_permissions','permission_audit','external_fiscal_rate_limits']) {
 assert.equal((await db.query(`select count(*)::integer count from private.${table}`)).rows[0].count,0,`${table} reset`);
}
assert.equal((await db.query('select count(*)::integer count from auth.users')).rows[0].count,1,'managed auth preserved');
assert.equal((await db.query('select count(*)::integer count from storage.buckets')).rows[0].count,1,'managed buckets preserved');
assert.equal((await db.query('select count(*)::integer count from storage.objects')).rows[0].count,1,'managed objects preserved');
await db.exec(`select private.bootstrap_superadmin('admin.master',replace(extensions.crypt('synthetic-fresh-dba',extensions.gen_salt('bf',12)),'$2a$','$2b$'));`);
const freshDba=await scalar('select public.inventory_login($1,$2) result',['admin.master','synthetic-fresh-dba']);
assert.equal(freshDba.must_change_password,true);
const freshDbaTenants=await scalar('select public.inventory_tenants($1) result',[freshDba.session_token]);
assert.deepEqual(freshDbaTenants.tenants,[]);
console.log('PASS full test reset clears custom accounts/data, preserves Supabase-managed schemas, and allows fresh DBA bootstrap');
console.log('PASS tenant inventory/cash/pending isolation, token revocation, first-password gate, role escalation, employee isolation, private grants, identity collisions');
await db.close();

