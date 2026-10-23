const { test } = require('node:test');
const assert = require('node:assert/strict');

const POLICY = import('../lib/preview-database-policy.mjs');
const GUARD = import('../lib/server/inventory-session.mjs');
const BRANCH = 'codex/homologacao-completa-20261023';
const LIVE = 'https://dpauqdihvhbbaellwjav.supabase.co';
const KEY = 'test_publishable_key_only';
const TOKEN = 'a'.repeat(64);
const USER_ID = '00000000-0000-4000-8000-000000000001';

const response = () => ({
  code: null, body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});

test('shared database Preview is opt-in, branch restricted, and never accepts missing config', async () => {
  const { previewDatabaseIsBlocked } = await POLICY;
  const setup = {deploymentEnv:'preview',databaseUrl:LIVE,publicKey:KEY};
  assert.equal(previewDatabaseIsBlocked(setup),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:'other-feature'}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:BRANCH}),false);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:BRANCH,publicKey:''}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:BRANCH,databaseUrl:''}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:BRANCH,databaseUrl:'http://dpauqdihvhbbaellwjav.supabase.co'}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:BRANCH,databaseUrl:'https://username@dpauqdihvhbbaellwjav.supabase.co'}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,allowSharedDatabase:true,branch:BRANCH,databaseUrl:'https://dpauqdihvhbbaellwjav.supabase.co:444'}),true);
  assert.equal(previewDatabaseIsBlocked({...setup,databaseUrl:'https://separate-preview.supabase.co'}),false);
  assert.equal(previewDatabaseIsBlocked({...setup,deploymentEnv:'production'}),false);
});

test('authorized shared-db Preview still requires a valid native session', async () => {
  const { requireInventorySession } = await GUARD;
  const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','ESTOQUE_ALLOW_SHARED_DB_PREVIEW',
    'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {
    Object.assign(process.env, {
      VERCEL_ENV:'preview',
      VERCEL_GIT_COMMIT_REF:BRANCH,
      ESTOQUE_ALLOW_SHARED_DB_PREVIEW:'true',
      NEXT_PUBLIC_SUPABASE_URL:LIVE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:KEY
    });
    let callCount=0;
    const factory = (_url,_key) => ({
      rpc: async (name,parameters) => {
        assert.equal(name,'inventory_validate_session');
        assert.deepEqual(parameters,{p_session_token:TOKEN});
        callCount++;
        return {data:{valid:true,user:{id:USER_ID,role:'employee'}},error:null};
      }
    });
    const good=response();
    assert.equal(await requireInventorySession({headers:{'x-estoque-session':TOKEN}},good,{clientFactory:factory}),true);
    assert.equal(callCount,1);
    assert.equal(good.code,null);

    const missing=response();
    assert.equal(await requireInventorySession({headers:{}},missing,{clientFactory:factory}),false);
    assert.equal(missing.code,401);
    assert.equal(callCount,1,'do not query database for a missing session');

    process.env.VERCEL_GIT_COMMIT_REF='unreviewed-branch';
    const denied=response();
    assert.equal(await requireInventorySession({headers:{'x-estoque-session':TOKEN}},denied,
      {clientFactory:()=>{throw Error('must not access database');}}),false);
    assert.equal(denied.code,503);
    assert.equal(callCount,1);
  } finally {
    for (const key of keys) {
      if (previous[key]===undefined) delete process.env[key];
      else process.env[key]=previous[key];
    }
  }
});

test('build includes Preview policy without putting credentials in Next configuration', () => {
  const fs=require('node:fs');
  const nextConfig=fs.readFileSync('next.config.js','utf8');
  const ui=fs.readFileSync('pages/index.js','utf8');
  const server=fs.readFileSync('lib/server/inventory-session.mjs','utf8');
  assert.match(nextConfig,/ESTOQUE_SHARED_DB_PREVIEW: process\.env\.ESTOQUE_ALLOW_SHARED_DB_PREVIEW/);
  assert.match(nextConfig,/ESTOQUE_PREVIEW_BRANCH: process\.env\.VERCEL_GIT_COMMIT_REF/);
  assert.doesNotMatch(nextConfig,/SUPABASE_ANON_KEY|session_token|password_hash/i);
  assert.match(ui,/previewDatabaseIsBlocked\(/);
  assert.match(server,/previewDatabaseIsBlocked\(/);
  assert.match(server,/inventory_validate_session/);
});


