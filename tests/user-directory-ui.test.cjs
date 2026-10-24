const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const dir=fs.readFileSync('components/UserDirectoryEditor.js','utf8');
const parent=fs.readFileSync('components/TenantAdministration.js','utf8');
test('user editor submits only metadata with existing authenticated RPC',()=>{
 assert.match(dir,/invoke\('inventory_user_update'/);
 for(const k of ['p_user_id','p_username','p_display_name','p_active'])
   assert.ok(dir.includes(k),k);
 assert.doesNotMatch(dir,/p_password|p_role|p_tenant_id|password_hash|service_role/);
 assert.match(parent,/<UserDirectoryEditor/);
});
test('front-end hides unauthorized targets while server remains authoritative',()=>{
 assert.match(dir,/user\?\.role==='superadmin'\|\|user\?\.role==='admin'/);
 assert.match(dir,/x\.id!==user\?\.id/);
 assert.match(dir,/x\.role!=='superadmin'/);
 assert.match(dir,/x\.role==='employee'/);
 assert.match(dir,/await onChanged\(\)/);
});
test('client does not interpret or echo raw database errors',()=>{
 assert.match(dir,/catch\{/);
 assert.doesNotMatch(dir,/error\.message|failure\.message/);
 assert.match(dir,/role="alert"/);
 assert.match(dir,/role="status"/);
});
