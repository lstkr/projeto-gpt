const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const view = readFileSync(join(__dirname, '../pages/index.js'), 'utf8');
// The fiscal module may have a server-backed permission guard before the fragment.
const start = view.indexOf("{view === 'documents' &&");
assert.ok(start >= 0, 'documents module must be rendered');
const documents = view.slice(start);
const reviewStart = documents.indexOf('{draft && <section className="panel review-panel">');
assert.ok(reviewStart >= 0, 'fiscal review panel must be present');
const review = documents.slice(reviewStart);

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

test('processamento compacto aparece acima da fila e integra OCR', () => {
  const progress = documents.indexOf('Arquivos sendo processados');
  const pending = documents.indexOf('Notas aguardando conferência');
  assert.ok(progress >= 0 && pending > progress);
  assert.ok(documents.includes("Reconhecendo texto da imagem"));
  assert.ok(!documents.includes('uploadBatchProgress.files.map'));
  assert.ok(!documents.includes('{busy && <div className="notice">{processingType'));
});

test('notas prontas ficam disponíveis para conferência durante OCR de outras notas', () => {
  assert.match(documents, /onClick=\{\(\)=>void openPendingReceipt\(row\)\}/);
  assert.doesNotMatch(documents, /disabled=\{busy\} onClick=\{\(\)=>void openPendingReceipt\(row\)\}/);
  assert.ok(view.includes('await refreshPending();'), 'a fila é atualizada durante o processamento');
});


test('conversão de unidades usa fator explícito e pode ser salva por fornecedor e código', () => {
  assert.ok(review.includes('Fator de conversão da linha'));
  assert.ok(review.includes('Entrada calculada:'));
  assert.ok(review.includes('o sistema não presume o conteúdo de caixas ou pacotes'));
  assert.ok(review.includes('Salvar este fator para o mesmo código e fornecedor'));
  assert.ok(view.includes('stockConversion'));
});
