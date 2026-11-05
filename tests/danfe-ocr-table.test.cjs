const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = import('../lib/danfe-ocr-table.mjs');
// Transcrição sintética do mesmo formato de colunas; sem identificação da nota real.
const header = 'DANFE\nDESTINATARIO\nENDERECO EXEMPLO\nFATURA / DUPLICATAS\n999,00\nPESO LIQUIDO\n8,000\nDADOS DO PRODUTO / SERVICO\nCODIGO DESCRICAO NCM CST CFOP UNID QUANT VL UNIT VL TOTAL';
const sparse = [header,
  '19022000 | 0102 | 5101 |UN', '5,00)', '2,00)', '10,00',
  '00918', 'Produto Alfa - 10 unid',
  '19022000 | 0102 | 5101 | UN', '6,00)', '3,00', '18,00)', '|',
  '00920', 'Produto Beta - 10 unid', '4,00)', '28,00', '|',
  '00919', 'Produto Gama - 10 unid', '19022000 | 01025101 | UN', '7,00)',
  'RESERVADO AO FISCO', 'DADOS ADICIONAIS', '123,00'
].join('\n');

function expectedItems() {
  return [['00918', 'Produto Alfa - 10 unid', 5, 2, 10],
    ['00920', 'Produto Beta - 10 unid', 6, 3, 18],
    ['00919', 'Produto Gama - 10 unid', 7, 4, 28]];
}

function values(items) {
  return items.map((item) => [item.code, item.name, item.quantity, item.unitPrice, item.lineTotal]);
}

test('DANFE dispersa extrai somente a tabela e preserva códigos e embalagem como texto', async () => {
  const { parseDanfeOcrTable } = await api;
  const items = parseDanfeOcrTable(sparse);
  assert.deepEqual(values(items), expectedItems());
  for (const item of items) {
    assert.equal(item.unit, 'un');
    assert.match(item.readingWarning, /Confira/);
    assert.equal(item.conversionFactor, undefined);
  }
});

test('DANFE com linhas inteiras lê colunas fiscais sem usar NCM/CFOP como quantidade', async () => {
  const { parseDanfeOcrTable } = await api;
  const text = [header,
    '00918 Produto Alfa - 10 unid 19022000 0102 5101 UN 5,00 2,00 10,00',
    '00920 Produto Beta - 10 unid 19022000 0102 5101 UN 6,00 3,00 18,00',
    '00919 Produto Gama - 10 unid 19022000 0102 5101 UN 7,00 4,00 28,00',
    'DADOS ADICIONAIS'].join('\n');
  assert.deepEqual(values(parseDanfeOcrTable(text)), expectedItems());
});

test('tabela ilegível ou incompleta não vira produtos de endereço, imposto ou rodapé', async () => {
  const { parseDanfeOcrTable } = await api;
  assert.deepEqual(parseDanfeOcrTable(header + '\nAOS DO PRI ruído\nDADOS ADICIONAIS\n55,00'), []);
  assert.deepEqual(parseDanfeOcrTable(sparse.replace('18,00)', '')), []);
  assert.deepEqual(parseDanfeOcrTable(sparse.replace('6,00)', '9,00)')), []);
  assert.deepEqual(parseDanfeOcrTable(sparse.replace('4,00)', '4,0001)')), []);
  assert.deepEqual(parseDanfeOcrTable('DANFE\nENDERECO\n1,00 2,00'), []);
  assert.equal(parseDanfeOcrTable('CODIGO DESCRICAO\n00918 PAPEL\n1,00 UN 2,00 2,00'), null);
});

test('códigos repetidos permanecem linhas separadas; metadados ausentes não são inventados', async () => {
  const { parseDanfeOcrTable } = await api;
  const items = parseDanfeOcrTable(sparse.replaceAll('00920', '00918'));
  assert.equal(items.length, 3);
  assert.equal(items[0].code, items[1].code);
  assert.equal(items[0].lineTotal, 10);
  assert.equal(items[1].lineTotal, 18);
});

test('reinterpretação explícita conserva fornecedor e IDs da pendência mas invalida todas as conferências', async () => {
  const { rebuildSavedDanfe } = await import('../lib/receipt-ocr-cleanup.mjs');
  const draft = { ocrText: header + '\nruído\n--- LEITURA ALTERNATIVA ---\n' + sparse,
    supplier: 'Fornecedor sintético', pendingId: 'pending-synthetic', pendingRevision: 7,
    items: [{ name: 'Cabeçalho incorreto' }], reviewedItems: { old: true },
    finalReviewed: true, totalsReviewed: true, checkedBy: 'Conferente', officialVerified: true };
  const next = rebuildSavedDanfe(draft, {
    mergeItems: (first, second) => [...first, ...second],
    reconcileTotals: () => ({ subtotal: 56, discount: 0, total: 56 })
  });
  assert.deepEqual(values(next.items), expectedItems());
  assert.equal(next.supplier, draft.supplier);
  assert.equal(next.pendingId, draft.pendingId);
  assert.equal(next.pendingRevision, 7);
  assert.equal(next.total, 56);
  assert.deepEqual(next.reviewedItems, {});
  assert.equal(next.finalReviewed, false);
  assert.equal(next.totalsReviewed, false);
  assert.equal(next.officialVerified, false);
  assert.equal(next.checkedBy, '');
  assert.equal(draft.items[0].name, 'Cabeçalho incorreto');
  assert.equal(rebuildSavedDanfe({ ocrText: header }, {}), null);
});

test('preço e total negativos nunca viram valores positivos na extração', async () => {
  const { parseDanfeOcrTable } = await api;
  for (const sign of ['-', '−', '+']) {
    const text = header + '\n00918 Produto Alfa 19022000 0102 5101 UN 5,00 ' + sign + '2,00 ' + sign + '10,00';
    assert.deepEqual(parseDanfeOcrTable(text), []);
  }
});
