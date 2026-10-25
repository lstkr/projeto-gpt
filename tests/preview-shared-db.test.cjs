const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const POLICY = import('../lib/preview-database-policy.mjs');
const REF = 'testref';
const URL = 'https://testref.supabase.co';
const KEY = 'test_publishable_key_only';

test('Preview and Production accept only the exact configured Supabase ref', async () => {
  const { deploymentDatabaseIsBlocked } = await POLICY;
  for (const deploymentEnv of ['preview', 'production']) {
    const allowed = { deploymentEnv, databaseUrl: URL, publicKey: KEY, allowedRef: REF };
    assert.equal(deploymentDatabaseIsBlocked(allowed), false);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, allowedRef: undefined }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, allowedRef: '' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'https://otherref.supabase.co' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'https://testref.supabase.co.attacker.invalid' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'http://testref.supabase.co' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'not a url' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'https://user@testref.supabase.co' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'https://testref.supabase.co:444' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, databaseUrl: 'https://testref.supabase.co/path' }), true);
    assert.equal(deploymentDatabaseIsBlocked({ ...allowed, publicKey: '' }), true);
  }
});

test('local development is not blocked by deployment allowlist checks', async () => {
  const { deploymentDatabaseIsBlocked } = await POLICY;
  assert.equal(deploymentDatabaseIsBlocked({ deploymentEnv: 'development' }), false);
  assert.equal(deploymentDatabaseIsBlocked({}), false);
});

test('Next config exposes only the non-secret allowlist reference', () => {
  const nextConfig = fs.readFileSync('next.config.js', 'utf8');
  assert.match(nextConfig, /ESTOQUE_SUPABASE_ALLOWED_REF:\s*process\.env\.ESTOQUE_SUPABASE_ALLOWED_REF/);
  assert.doesNotMatch(nextConfig, /SERVICE_ROLE|SECRET_KEY|SUPABASE_SECRET|session_token|password_hash/i);
  assert.doesNotMatch(nextConfig, /ESTOQUE_ALLOW_SHARED_DB_PREVIEW|ESTOQUE_PREVIEW_BRANCH/);
});
