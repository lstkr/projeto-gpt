const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const authModule = import('../lib/server/inventory-session.mjs');
const TOKEN = 'a'.repeat(64);
const USER_ID = '00000000-0000-4000-8000-000000000001';

function mockResponse() {
  return {
    code: null, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('missing or malformed session is rejected without contacting Supabase', async () => {
  const { requireInventorySession } = await authModule;
  for (const value of [undefined, '', 'invalid', 'x'.repeat(64), ['a'.repeat(64)]]) {
    const res = mockResponse();
    const valid = await requireInventorySession(
      { headers: { 'x-estoque-session': value } }, res,
      { clientFactory: () => { throw new Error('must not be called'); } }
    );
    assert.equal(valid, false);
    assert.equal(res.code, 401);
  }
});

test('expired or revoked native session is rejected by the RPC', async () => {
  const { requireInventorySession } = await authModule;
  const res = mockResponse();
  let calls = 0;
  const valid = await requireInventorySession(
    { headers: { 'x-estoque-session': TOKEN } }, res,
    { clientFactory: () => ({ rpc: async (name, params) => {
      calls++;
      assert.equal(name, 'inventory_validate_session');
      assert.deepEqual(params, { p_session_token: TOKEN });
      return { data: null, error: { code: '28000' } };
    } }) }
  );
  assert.equal(valid, false);
  assert.equal(res.code, 401);
  assert.equal(calls, 1);
});

test('Supabase outage returns 503 rather than exposing internal errors', async () => {
  const { requireInventorySession } = await authModule;
  const res = mockResponse();
  const valid = await requireInventorySession(
    { headers: { 'x-estoque-session': TOKEN } }, res,
    { clientFactory: () => ({ rpc: async () => { throw new Error('secret connection details'); } }) }
  );
  assert.equal(valid, false);
  assert.equal(res.code, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /secret connection details/);
  assert.ok(!JSON.stringify(res.body).includes(TOKEN));
});

test('active native sessions use only the lightweight RPC without returning data or caching', async () => {
  const { requireInventorySession } = await authModule;
  const calls = [];
  for (const role of ['admin', 'employee']) {
    const res = mockResponse();
    const valid = await requireInventorySession(
      { headers: { 'x-estoque-session': TOKEN } }, res,
      { clientFactory: (_url, _key, options) => {
        assert.deepEqual(options.auth, { persistSession: false, autoRefreshToken: false });
        return { rpc: async (name, params) => {
          calls.push(name);
          assert.deepEqual(params, { p_session_token: TOKEN });
          return { data: { valid: true, user: { id: USER_ID, role } }, error: null };
        } };
      } }
    );
    assert.equal(valid, true);
    assert.equal(res.code, null);
    assert.equal(res.body, null);
  }
  assert.deepEqual(calls, ['inventory_validate_session', 'inventory_validate_session']);
});

test('RPC absence and database errors fail closed with no inventory fallback or leaks', async () => {
  const { requireInventorySession } = await authModule;
  for (const code of ['PGRST202', '42883', '42501', 'XX000']) {
    const res = mockResponse();
    const calls = [];
    const valid = await requireInventorySession(
      { headers: { 'x-estoque-session': TOKEN } }, res,
      { clientFactory: () => ({ rpc: async (name) => {
        calls.push(name);
        return { data: null, error: { code, message: TOKEN, details: 'private database details' } };
      } }) }
    );
    assert.equal(valid, false);
    assert.equal(res.code, 503);
    assert.deepEqual(calls, ['inventory_validate_session']);
    assert.ok(!JSON.stringify(res.body).includes(TOKEN));
    assert.doesNotMatch(JSON.stringify(res.body), /private database details/);
  }
});

test('malformed or legacy RPC responses are unavailable, never authenticated', async () => {
  const { requireInventorySession } = await authModule;
  for (const data of [
    null, false, [], {}, { valid: true },
    { user: { id: USER_ID, role: 'admin' }, products: [] },
    { valid: false, user: { id: USER_ID, role: 'admin' } },
    { valid: 'true', user: { id: USER_ID, role: 'admin' } },
    { valid: true, user: { role: 'employee' } },
    { valid: true, user: { id: 'invalid', role: 'employee' } },
    { valid: true, user: { id: USER_ID, role: 'owner' } },
    { valid: true, user: { id: USER_ID, role: null } }
  ]) {
    const res = mockResponse();
    const valid = await requireInventorySession(
      { headers: { 'x-estoque-session': TOKEN } }, res,
      { clientFactory: () => ({ rpc: async () => ({ data, error: null }) }) }
    );
    assert.equal(valid, false);
    assert.equal(res.code, 503);
    assert.ok(!JSON.stringify(res.body).includes(TOKEN));
    assert.ok(!JSON.stringify(res.body).includes(USER_ID));
  }
});

test('both fiscal routes enforce session checks before making external requests', () => {
  for (const path of ['pages/api/qr-externo.js', 'pages/api/consulta-nfce.js']) {
    const source = fs.readFileSync(path, 'utf8');
    const auth = source.indexOf('await requireInventorySession(req, res)');
    const handler = source.indexOf('export default async function handler');
    const externalCall = path.includes('consulta-nfce')
      ? source.indexOf('await fetchOfficial(canonical', handler)
      : source.indexOf('await fetch(', handler);
    assert.ok(auth > handler, path + ' must validate session in its handler');
    assert.ok(externalCall > auth, path + ' must validate session before external fetch');
  }
  const page = fs.readFileSync('pages/index.js', 'utf8');
  assert.match(page, /decodeQrViaExternalApi\(reference, sessionToken\)/);
  assert.match(page, /detectNfceQrCodes\(canvases, prepared\.qrCanvases, accessCode\)/);
  assert.match(page, /'x-estoque-session': accessCode/);
});

