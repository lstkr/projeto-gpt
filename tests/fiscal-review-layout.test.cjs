const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const view = readFileSync(join(__dirname, '../pages/index.js'), 'utf8');
const documents = view.slice(view.indexOf("{view === 'documents' && <>"));
const review = documents.slice(documents.indexOf('{draft && <section className="panel review-panel">'));

test('importação de notas aparece antes da fila de conferência', () => {
  const importArea = documents.indexOf('Da nota fiscal para o estoque');
  const pendingArea = documents.indexOf('Notas aguardando conferência');
  assert.ok(importArea >= 0 && pendingArea > importArea);
});

test('SEFAZ precede dados do fornecedor e conferência dos itens', () => {
  const sefaz = review.indexOf('Conferência automática com a SEFAZ/SVRS');
  const supplier = review.indexOf('Dados do fornecedor e da nota');
  const items = review.indexOf('Conferência do encarregado');
  assert.ok(sefaz >= 0 && supplier > sefaz && items > supplier);
});

test('QR expõe chave apenas no cartão identificado, com edição sob demanda', () => {
  assert.equal((review.match(/QR Code identificado/g) || []).length, 1);
  assert.ok(review.includes('qr-key-correction'));
  assert.ok(review.includes('Chave incorreta? Corrigir'));
  assert.ok(!review.includes('<span>Corrigir chave da NFC-e</span>'));
  assert.ok(review.includes('href="https://github.com/pcelias-ctrl/nfc-e"'));
  assert.ok(review.includes("draft.qrReader?.includes('API externa')"));
});
