const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

test('pipe protegido preserva UTF-8 fragmentado e delimitadores sem leitura raw do terminal', async () => {
  const { readProtectedInput } = await import('../scripts/admin/bootstrap-input.mjs');
  const expected = { connectionString: 'postgresql://exemplo/postgres',
    password: 'sintética-ç-🔒', confirmation: 'sintética-ç-🔒' };
  const encoded = Buffer.from(JSON.stringify(expected));
  const fragments = Array.from(encoded, (byte) => Buffer.from([byte]));
  assert.deepEqual(await readProtectedInput(Readable.from(fragments)), expected);
});

test('iniciador Windows entrega URI ao Node e recusa confirmação antes de conectar',
  { skip: process.platform !== 'win32' }, () => {
    const scriptPath = resolve('scripts/admin/bootstrap-windows.ps1').replaceAll("'", "''");
    const command = `
      $global:answers = [System.Collections.Generic.Queue[string]]::new()
      $global:answers.Enqueue('postgresql://postgres.abcdefghijklmnopqrst:ficticia123@aws-0-us-east-2.pooler.supabase.com:5432/postgres')
      $global:answers.Enqueue('primeira12345')
      $global:answers.Enqueue('segunda12345')
      function global:Read-Host {
        param([string]$Prompt,[switch]$AsSecureString)
        ConvertTo-SecureString $global:answers.Dequeue() -AsPlainText -Force
      }
      & '${scriptPath}' -ProjectRef 'abcdefghijklmnopqrst'
    `;
    const execution = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-Command', command], { encoding: 'utf8', timeout: 15_000,
      // Não herde o catálogo de módulos do PowerShell 7 ao testar o Windows PowerShell 5.1.
      env: Object.fromEntries(Object.entries(process.env)
        .filter(([name]) => name.toLowerCase() !== 'psmodulepath')) });
    assert.ifError(execution.error);
    assert.equal(execution.status, 1);
    const diagnostics = execution.stdout + execution.stderr;
    assert.match(diagnostics, /coincidem/);
    assert.doesNotMatch(diagnostics, /ficticia123|primeira12345|segunda12345|pooler\.supabase\.com/);
  });

test('pipe vazio, JSON truncado, campos ausentes e payload excessivo falham sem expor conteúdo', async () => {
  const { readProtectedInput } = await import('../scripts/admin/bootstrap-input.mjs');
  for (const input of ['', '{"password":"MARCADOR_PRIVADO"', 'null', '{}',
    '{"connectionString":7,"password":"MARCADOR_PRIVADO","confirmation":"x"}', 'x'.repeat(16_385)]) {
    await assert.rejects(readProtectedInput(Readable.from([input])), (failure) => {
      assert.match(failure.message, /Entrada protegida inválida/);
      assert.doesNotMatch(failure.message, /MARCADOR_PRIVADO|SyntaxError/);
      return true;
    });
  }
});
