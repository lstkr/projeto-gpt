const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = fs.readFileSync('pages/index.js', 'utf8');
const start = page.indexOf('function localizedValue(raw)');
const end = page.indexOf('async function prepareReceiptCanvases', start);
const matching = fs.readFileSync('lib/duplicate-products.mjs', 'utf8').replace(/^export /gm, '');
const parseItems = vm.runInNewContext('const norm=v=>String(v||"").trim().toLowerCase();\n' +
  matching + '\n' + page.slice(start, end) + '\nparseReceiptOcr', { URL, TextDecoder });
const receipt = 'CODIGO DESCRICAO\n001234 PAPEL\nBRANCO A4\n2,00 UN 3,00 6,00\ndesconto 1,00\nvalor líquido 5,00\nSub-Total 6,00';

test('descrição em duas linhas preserva um item sem desconto ou líquido como produto', async () => {
  const { receiptItemsFromOcr } = await import('../lib/receipt-ocr-cleanup.mjs');
  const items = receiptItemsFromOcr({ text: receipt, confidence: 90 }, parseItems);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'PAPEL BRANCO A4');
  assert.equal(items[0].code, '001234');
  assert.equal(items[0].itemDiscount, 1);
});

test('confiança baixa ou ausente destaca sem remover nem aprovar itens', async () => {
  const { receiptItemsFromOcr } = await import('../lib/receipt-ocr-cleanup.mjs');
  for (const confidence of [12, 69, undefined, NaN, 99]) {
    const items = receiptItemsFromOcr({ text: receipt, confidence }, parseItems);
    assert.equal(items.length, 1);
    assert.match(items[0].readingWarning, /por linha indisponível/);
    assert.equal(items[0].reviewed, undefined);
  }
});

test('líquido abreviado não contamina descrição pendente', async () => {
  const { receiptItemsFromOcr } = await import('../lib/receipt-ocr-cleanup.mjs');
  const text = 'CODIGO DESCRICAO\n001234 PAPEL\nVL LIQ 5,00\n2,00 UN 3,00 6,00';
  const items = receiptItemsFromOcr({ text, confidence: 70 }, parseItems);
  assert.equal(items.length, 1);
  assert.equal(items[0].lineTotal, 6);
});

test('CNPJ quebrado é validado e CPF colado ao destinatário não vira emitente', async () => {
  const { extractIssuerCnpj } = await import('../lib/fiscal-identity.mjs');
  assert.equal(extractIssuerCnpj('CNPJ/CPF 11222333000181'), '11222333000181');
  assert.equal(extractIssuerCnpj('CNPJ: 11.222.\n333/0001-81'), '11222333000181');
  assert.equal(extractIssuerCnpj('CPF123.456.789-00CLIENTE\nCNPJ 11.222.333/0001-81'), '');
  assert.equal(extractIssuerCnpj('CNPJ 11.222.333/0001-81\nCPF123.456.789-00CLIENTE'), '11222333000181');
});

const withLines = (text, lines) => ({ text, confidence: 99,
  blocks: [{ paragraphs: [{ lines }] }] });

test('linha fraca destaca seu item mesmo com média alta; linha forte não aprova', async () => {
  const { receiptItemsFromOcr } = await import('../lib/receipt-ocr-cleanup.mjs');
  const text = 'CODIGO DESCRICAO\n001234 PAPEL\n2,00 UN 3,00 6,00\n005678 CANETA\n1,00 UN 2,00 2,00';
  const result = withLines(text, [
    { text: '001234 PAPEL', confidence: 99 },
    { text: '2,00 UN 3,00 6,00', confidence: 20 },
    { text: '005678 CANETA', confidence: 99 },
    { text: '1,00 UN 2,00 2,00', confidence: 99 }
  ]);
  const items = receiptItemsFromOcr(result, parseItems);
  assert.equal(items.length, 2);
  assert.match(items[0].readingWarning, /baixa confiança/);
  assert.equal(items[1].readingWarning, '');
  assert.equal(items[1].reviewed, undefined);
  assert.equal(result.confidence, 99);
});

test('palavra fraca também destaca e conserva aviso fiscal anterior', async () => {
  const { receiptItemsFromOcr } = await import('../lib/receipt-ocr-cleanup.mjs');
  const text = '001234 PAPEL';
  const result = withLines(text, [{ text, confidence: 99, words: [{ confidence: 10 }] }]);
  const items = receiptItemsFromOcr(result, () => [{ code: '001234', readingWarning: 'Divergência de total.' }]);
  assert.match(items[0].readingWarning, /Divergência de total/);
  assert.match(items[0].readingWarning, /baixa confiança/);
});
