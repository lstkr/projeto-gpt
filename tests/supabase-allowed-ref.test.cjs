const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const REF = 'abcdefghijklmnopqrst';
const URL = `https://${REF}.supabase.co`;

for (const deploymentEnv of ['preview', 'production']) {
  test(`${deploymentEnv} bloqueia ref ausente, inválida ou divergente em qualquer branch`, async () => {
    const { getSupabaseConfig } = await import('../lib/supabase-config.mjs');
    const setup = { url: URL, publicKey: 'synthetic-public', deploymentEnv, previewUrl: URL };
    assert.deepEqual(getSupabaseConfig({ ...setup, allowedRef: REF }), { url: URL, publicKey: 'synthetic-public' });
    for (const allowedRef of ['', 'invalid', 'b'.repeat(20)]) {
      assert.throws(() => getSupabaseConfig({ ...setup, allowedRef, branch: 'main', allowSharedDatabase: true }),
        { code: 'SUPABASE_DATABASE_BLOCKED' });
    }
    for (const url of [URL + '/path', URL.replace('https:', 'http:'), URL.replace(REF, REF + '.evil')]) {
      assert.throws(() => getSupabaseConfig({ ...setup, url, previewUrl: url, allowedRef: REF }),
        { code: 'SUPABASE_DATABASE_BLOCKED' });
    }
  });
  test(`${deploymentEnv} rejeita configuração antes do build e antes de criar cliente`, () => {
    const env = { ...process.env, VERCEL_ENV: deploymentEnv, NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public',
      ESTOQUE_SUPABASE_ALLOWED_REF: '', VERCEL_GIT_COMMIT_REF: 'any-branch' };
    const result = spawnSync(process.execPath, ['-e', "require('./next.config.js')().catch(error => { console.error(error.code); process.exitCode = 1; })"],
      { env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SUPABASE_DATABASE_BLOCKED/);
    const runtime = spawnSync(process.execPath, ['--input-type=module', '-e',
      "import {getSupabaseConfig} from './lib/supabase-config.mjs'; getSupabaseConfig();"], { env, encoding: 'utf8' });
    assert.equal(runtime.status, 1);
    assert.match(runtime.stderr, /SUPABASE_DATABASE_BLOCKED/);
    const guard = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import {requireInventorySession} from './lib/server/inventory-session.mjs';
      let calls = 0;
      const response = {status(code) {this.code=code;return this;},json() {return this;}};
      const valid = await requireInventorySession({headers:{'x-estoque-session':'a'.repeat(64)}}, response,
        {clientFactory:() => {calls++;throw Error('Não deve conectar');}});
      if (valid || calls !== 0 || response.code !== 503) process.exitCode=1;
    `], { env, encoding: 'utf8' });
    assert.equal(guard.status, 0, guard.stderr);
    env.ESTOQUE_SUPABASE_ALLOWED_REF = REF;
    const valid = spawnSync(process.execPath, ['-e', "require('./next.config.js')().then(config => { if (config.env.ESTOQUE_SUPABASE_ALLOWED_REF !== process.env.ESTOQUE_SUPABASE_ALLOWED_REF) process.exitCode = 1; })"],
      { env, encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
  });
}
