const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const PREVIEW = import('../scripts/prepare-static-preview.mjs');
const SCRIPT = resolve('scripts/prepare-static-preview.mjs');
const SECRET_FIXTURE = ['sb', 'secret', 'fixture-only'].join('_');
const PUBLIC_FIXTURE = ['sb', 'publishable', 'fixture-only'].join('_');

function jwtFixture(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return [header, payload, 'synthetic-signature'].join('.');
}

const privilegedFixtures = [['secret', SECRET_FIXTURE],
  ['secret com espaço', ' ' + SECRET_FIXTURE + ' '],
  ['secret com tabulação', '\t' + SECRET_FIXTURE + '\t'],
  ['secret com quebra de linha', '\n' + SECRET_FIXTURE + '\n'],
  ['service JWT', jwtFixture('service_role')],
  ['service JWT com espaços', ' ' + jwtFixture('service_role') + ' ']];

for (const [kind, key] of privilegedFixtures) {
  test('prévia rejeita chave privilegiada sintética: ' + kind, async () => {
    const { validatePublicPreviewKey } = await PREVIEW;
    assert.throws(() => validatePublicPreviewKey(key), {
      code: 'SUPABASE_PUBLIC_KEY_UNSAFE', message: /Chave Supabase inadequada para publicação/
    });
  });
}

test('prévia aceita publishable e JWT anon sintéticos', async () => {
  const { validatePublicPreviewKey } = await PREVIEW;
  assert.doesNotThrow(() => validatePublicPreviewKey(PUBLIC_FIXTURE));
  assert.doesNotThrow(() => validatePublicPreviewKey(jwtFixture('anon')));
});

test('JWT malformado falha com erro de configuração', async () => {
  const { validatePublicPreviewKey } = await PREVIEW;
  assert.throws(() => validatePublicPreviewKey('invalid.payload.signature'), {
    code: 'SUPABASE_PUBLIC_KEY_UNSAFE'
  });
});

test('gerador falha antes de criar arquivos e não imprime chave privilegiada', () => {
  const directory = mkdtempSync(join(tmpdir(), 'estoque-static-preview-'));
  try {
    for (const [, key] of privilegedFixtures) {
      const result = spawnSync(process.execPath, [SCRIPT], { cwd: directory, encoding: 'utf8',
        env: { NEXT_PUBLIC_SUPABASE_URL: 'https://static-fixture.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: key } });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Chave Supabase inadequada para publicação/);
      assert.equal((result.stdout + result.stderr).includes(key), false);
      assert.equal(existsSync(join(directory, '_pages')), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
