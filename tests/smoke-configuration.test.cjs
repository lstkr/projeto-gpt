const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const SCRIPT = readFileSync('scripts/smoke-production.cjs', 'utf8');

function runSmoke(smokeUrl, fetch) {
  const messages = [];
  const sandbox = {
    require, URL, AbortSignal, fetch,
    process: { env: { ESTOQUE_SMOKE_URL: smokeUrl }, exit: () => { throw new Error('EXIT'); } },
    console: { log: () => {}, error: (message) => messages.push(message) }
  };
  return { sandbox, messages, execute: () => vm.runInNewContext(SCRIPT, sandbox) };
}

test('smoke sem URL ou com URL vazia termina antes de acessar a rede', () => {
  for (const smokeUrl of [undefined, '', '  ']) {
    const execution = runSmoke(smokeUrl, () => assert.fail('Não deve acessar a rede'));
    assert.throws(execution.execute, /EXIT/);
    assert.match(execution.messages[0], /ESTOQUE_SMOKE_URL is required/);
  }
});

test('smoke rejeita URL insegura, credenciais, caminho, query e fragmento', () => {
  for (const smokeUrl of ['http://example.test', 'https://user:password@example.test',
    'https://example.test/path', 'https://example.test/?query=1', 'https://example.test/#fragment']) {
    const execution = runSmoke(smokeUrl, () => assert.fail('Não deve acessar a rede'));
    assert.throws(execution.execute);
  }
});

test('smoke usa somente o destino explícito e mantém as oito verificações', async () => {
  const calls = [];
  const version = JSON.parse(readFileSync('package.json', 'utf8')).dependencies['pdfjs-dist'];
  const execution = runSmoke('https://homologation.example.test/', async (target, options) => {
    calls.push({ target, options });
    const asset = target.pathname === '/' || target.pathname.includes('/vendor/');
    return {
      status: asset ? 200 : options.method === 'POST' ? 401 : 405,
      headers: new Headers({ 'content-type': target.pathname === '/' ? 'text/html' :
        asset ? 'application/javascript' : 'application/json', 'cache-control': 'no-store' }),
      text: async () => target.pathname === '/' ? '_next/static/' :
        `pdfjsVersion = ${version}${' '.repeat(1100)}`,
      json: async () => ({ error: 'Sessão necessária' })
    };
  });
  await execution.execute();
  assert.equal(calls.length, 8);
  assert.ok(calls.every(({ target, options }) => target.origin === 'https://homologation.example.test' &&
    options.redirect === 'manual' && !options.headers.authorization));
  assert.deepEqual(execution.messages, []);
});
