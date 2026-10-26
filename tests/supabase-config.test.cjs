const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const CONFIG = import('../lib/supabase-config.mjs');
// A impressão detecta o destino removido sem recolocar sua referência no código.
const LEGACY_PROJECT_FINGERPRINT = '261c9b7052c7a907582715dc7ce7cc53b8d1007f2a42bed25d38fe48f11d5a37';

test('configuração ausente falha sem imprimir valores', async () => {
  const { getSupabaseConfig } = await CONFIG;
  for (const setup of [{ url: '', publicKey: 'fixture' }, { url: 'fixture', publicKey: '' }]) {
    assert.throws(() => getSupabaseConfig(setup), {
      code: 'SUPABASE_CONFIG_MISSING',
      message: /Configuração Supabase ausente: defina NEXT_PUBLIC_/
    });
  }
});

test('configuração usa exatamente as variáveis públicas e não retorna segredo servidor', async () => {
  const { getSupabaseConfig } = await CONFIG;
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const previous = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.throws(() => getSupabaseConfig(), { code: 'SUPABASE_CONFIG_MISSING' });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://unit-placeholder.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'unit-placeholder-key';
    assert.deepEqual(getSupabaseConfig(), { url: 'https://unit-placeholder.supabase.co',
      publicKey: 'unit-placeholder-key' });
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
  assert.deepEqual(getSupabaseConfig({ url: 'url-ficticia', publicKey: 'chave-ficticia' }),
    { url: 'url-ficticia', publicKey: 'chave-ficticia' });
  assert.doesNotMatch(readFileSync('lib/supabase-config.mjs', 'utf8'), /SERVICE_ROLE|SECRET_KEY/);
});

test('arquivos versionados não contêm destino legado nem chaves concretas embutidas', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const candidate of source.match(/[a-z]{20}/g) || []) {
      assert.notEqual(createHash('sha256').update(candidate).digest('hex'),
        LEGACY_PROJECT_FINGERPRINT, file);
    }
    assert.doesNotMatch(source, /sb_(?:publishable|secret)_[A-Za-z0-9_-]{16,}/, file);
  }
});
