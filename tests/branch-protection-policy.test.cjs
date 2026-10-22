const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {CHECKS,payload}=require('../lib/branch-protection-policy.cjs');
test('protection enforces PR checks, no bypass, linear history',()=>{
 const p=payload();
 assert.equal(p.enforce_admins,true);
 assert.equal(p.required_status_checks.strict,true);
 assert.equal(p.allow_force_pushes,false);
 assert.equal(p.allow_deletions,false);
 assert.equal(p.required_linear_history,true);
 assert.equal(p.required_conversation_resolution,true);
 assert.equal(payload(1).required_pull_request_reviews.required_approving_review_count,1);
 for(const x of [-1,7,1.5,'1',null])assert.throws(()=>payload(x),RangeError);
});
test('matrix check names are unique and declared for PostgreSQL 15/17',()=>{
 assert.equal(new Set(CHECKS).size,CHECKS.length);
 for(const [name,stem] of [
 ['fiscal-integrity.yml','Fiscal integrity / PostgreSQL'],
 ['session-rpc-tests.yml','Native session / PostgreSQL'],
 ['tenant-access.yml','Tenant isolation / PostgreSQL']]){
   const yaml=fs.readFileSync('.github/workflows/'+name,'utf8');
   assert.ok(yaml.includes('name: '+stem+' $'+'{{ matrix.postgres }}'),name);
   assert.match(yaml,/pull_request:/);
   assert.ok(CHECKS.includes(stem+' 15'));
   assert.ok(CHECKS.includes(stem+' 17'));
 }
});
test('admin change requires explicit --apply and gh auth',()=>{
 const txt=fs.readFileSync('scripts/admin/protect-main.cjs','utf8');
 assert.match(txt,/args\.includes\('--apply'\)/);
 assert.match(txt,/spawnSync\('gh'/);
 assert.doesNotMatch(txt,/process\.env\.GH_TOKEN|ghp_[a-zA-Z0-9]+/);
});
