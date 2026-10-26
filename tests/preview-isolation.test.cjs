const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('a Vercel Preview with production or missing Supabase variables is rejected before session validation', async () => {
  const { requireInventorySession } = await import('../lib/server/inventory-session.mjs');
  const names = ['VERCEL_ENV','NEXT_PUBLIC_SUPABASE_PREVIEW_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(names.map(k=>[k,process.env[k]]));
  const reply = () => ({
    code: 0, status(code) {this.code = code; return this;},
    json(body) {this.body = body; return this;}
  });
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_URL = 'https://separate-test-project.supabase.co';
    for (const [url,key] of [
      [undefined,undefined],
      ['https://synthetic-production.supabase.co','synthetic-public-key'],
      ['https://separate-test-project.supabase.co',undefined]
    ]) {
      if (url===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL=url;
      if (key===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=key;
      const response=reply();
      assert.equal(await requireInventorySession(
        {headers:{'x-estoque-session':'a'.repeat(64)}},response,
        {clientFactory:()=>{throw new Error('must not contact database');}}
      ),false);
      assert.equal(response.code,503);
      assert.match(response.body.error,/homologa/i);
    }
  } finally {
    for (const key of names) {
      if(previous[key]===undefined)delete process.env[key];
      else process.env[key]=previous[key];
    }
  }
});

test('UI and Next build environment include a fail-closed Preview gate', () => {
  const nextConfig=fs.readFileSync('next.config.js','utf8');
  const ui=fs.readFileSync('pages/index.js','utf8');
  assert.match(nextConfig,/ESTOQUE_DEPLOY_ENV:\s*process\.env\.VERCEL_ENV/);
  assert.match(ui,/const PREVIEW_UNSAFE = PREVIEW_DEPLOY/);
  assert.match(ui,/if \(PREVIEW_UNSAFE\)/);
  assert.match(ui,/HAS_SUPABASE_CONFIG = !PREVIEW_UNSAFE/);
  assert.match(ui,/Ambiente de homologação bloqueado/);
});
