const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the same pure receipt functions used by the production page, without
// needing a browser or JSX transpilation.
const source = fs.readFileSync('pages/index.js', 'utf8');
const start = source.indexOf('function localizedValue(raw)');
const end = source.indexOf('async function prepareReceiptCanvases', start);
assert.ok(start >= 0 && end > start, 'Receipt functions must be extractable');
const code = 'const norm = (v) => String(v || "").trim().toLocaleLowerCase("pt-BR");\n' +
  source.slice(start, end) +
  '\n({ parseReceiptOcr, mergeReceiptCandidates, compareInvoiceItems, reconcileReceiptTotals, normalizeReceiptUnit })';
const rules = vm.runInNewContext(code, { URL, console, TextDecoder });

const line = (code, name, quantity, unit, unitPrice, lineTotal) =>
  ({ code, name, quantity, unit, unitPrice, lineTotal });

test('Rio Sul: preserves line-level discount and fiscal gross/net totals', () => {
  const receipt = [
    'CÓDIGO DESCRIÇÃO',
    '0410160 SACO ADESIVADO TRANSP 7,6X3,3',
    '101,00 UN 0,20 20,20',
    'desconto 2,02',
    '0397431 SACO ADESIVADO TRANSP 8X18+3',
    '1,00 UN 0,30 0,30',
    '0010987 BOBINA 80MMX40MT',
    '4,00 UN 7,76 31,00',
    'Qtd Total de Itens 106',
    'Sub-Total 51,50',
    'Desconto 2,02',
    'Valor Total R$ 49,48'
  ].join('\n');
  const items = rules.parseReceiptOcr(receipt);
  const totals = rules.reconcileReceiptTotals(receipt, receipt, items);
  assert.equal(items.length, 3);
  assert.equal(items[0].itemDiscount, 2.02);
  assert.equal(items[2].unitPrice, 7.76, 'Do not silently overwrite printed price');
  assert.equal(items[2].lineTotal, 31);
  assert.equal(totals.subtotal, 51.5);
  assert.equal(totals.discount, 2.02);
  assert.equal(totals.total, 49.48);
});

test('Rudi Bonow: preserves printed manjericão ML for supervisor review', () => {
  const receipt = [
    'CÓDIGO DESCRIÇÃO',
    '613 MANJERICAO',
    '2,0000 ML 5,0000 10,00',
    '813 ABACATE',
    '1,0000 KG 4,8300 4,83',
    '836 TOMATE',
    '1,0000 KG 6,3700 6,37',
    'QTD TOTAL DE ITENS 3',
    'VALOR TOTAL R$ 21,20'
  ].join('\n');
  const items = rules.parseReceiptOcr(receipt);
  assert.equal(items.length, 3);
  assert.equal(items[0].unit, 'ml');
  assert.equal(items[0].quantity, 2);
  assert.equal(items[2].lineTotal, 6.37);
});

test('Two separate fiscal rows with the same code are never collapsed', () => {
  const first = line('813','ABACATE',1,'kg',4.83,4.83);
  const second = line('813','ABACATE',2,'kg',4.83,9.66);
  const merged = rules.mergeReceiptCandidates([first,second],
    [line('813','ABACATE',1,'un',4.83,4.83),second]);
  assert.equal(merged.length, 2);
  assert.match(merged[0].readingWarning, /unidade/i);
});

test('Different fiscal units never count as matching, even at the same price', () => {
  const [result] = rules.compareInvoiceItems(
    [line('813','ABACATE',1,'un',4.83,4.83)],
    [line('813','ABACATE',1,'kg',4.83,4.83)]
  );
  assert.notEqual(result.status, 'Confere');
  assert.match(result.status, /Unidade/i);
});

test('Normalized aliases are equivalent, without converting different dimensions', () => {
  assert.equal(rules.normalizeReceiptUnit('UND'),rules.normalizeReceiptUnit('UN'));
  assert.equal(rules.normalizeReceiptUnit('KGS'),rules.normalizeReceiptUnit('KG'));
  assert.notEqual(rules.normalizeReceiptUnit('KG'),rules.normalizeReceiptUnit('G'));
});

test('Conflicting OCR totals produce an alert instead of selecting the closest', () => {
  const first = 'Sub-Total 51,50\nDesconto 2,02\nValor Total 49,48';
  const second = 'Sub-Total 51,50\nDesconto 2,02\nValor Total 51,50';
  const result = rules.reconcileReceiptTotals(first,second,[
    line('1','ITEM UM',1,'un',51.5,51.5)
  ]);
  assert.equal(result.total,49.48);
  assert.match(result.totalsWarning,/discordam/);
});


/*
 * Public, independently published cafeteria NFC-e examples.
 * These are manually transcribed receipt-row fixtures from official
 * transparency publications, NOT OCR measurements on their original images.
 * No purchaser identifiers, CPF, QR credentials or full fiscal keys are copied.
 */
test('Public café: Figueira e Gusmão (Câmara dos Deputados), two items = R$ 30,90', () => {
  // https://www.camara.leg.br/cota-parlamentar/nota-fiscal-eletronica?ideDocumentoFiscal=6572977
  const receipt = [
    'CÓDIGO DESCRIÇÃO',
    '40101 CROISSANT MISTO',
    '1,0000 UN 18,0000 18,00',
    '30306 LARANJA INTEGRAL',
    '1,0000 UN 12,9000 12,90',
    'QTD TOTAL DE ITENS 2',
    'VALOR TOTAL R$ 30,90'
  ].join('\\n');
  const items = rules.parseReceiptOcr(receipt);
  const totals = rules.reconcileReceiptTotals(receipt, receipt, items);
  assert.equal(items.length, 2);
  assert.equal(items[0].code, '40101');
  assert.equal(items[1].unit, 'un');
  assert.equal(items.reduce((sum,item) => sum + item.lineTotal, 0), 30.9);
  assert.equal(totals.total, 30.9);
});

test('Public café: BSB Aero (Senado), pingado and empanada = R$ 34,50', () => {
  // https://www6g.senado.leg.br/transparencia/sen/download/ceaps/documento/222524
  const receipt = [
    'CÓDIGO DESCRIÇÃO',
    '130 PINGADO G',
    '1,0000 UN 17,0000 17,00',
    '171 EMPANADA INT FRANGO COM CENOURA',
    '1,0000 UN 17,5000 17,50',
    'QTD TOTAL DE ITENS 2',
    'VALOR TOTAL R$ 34,50'
  ].join('\\n');
  const items = rules.parseReceiptOcr(receipt);
  const totals = rules.reconcileReceiptTotals(receipt, receipt, items);
  assert.equal(items.length, 2);
  assert.equal(items[1].name, 'EMPANADA INT FRANGO COM CENOURA');
  assert.equal(totals.total, 34.5);
  assert.equal(items.reduce((sum,item) => sum + item.lineTotal, 0), 34.5);
});

test('Public café: Caramella (Câmara), preserves zero-cost entries and tip', () => {
  // https://www.camara.leg.br/cota-parlamentar/nota-fiscal-eletronica?ideDocumentoFiscal=6505345
  // The official record contains four fiscal lines. Free accompaniments
  // are valid products, not blank OCR rows; gratuity should be reviewed
  // for classification before posting to physical inventory.
  const original = [
    line('16511','BUFFET MANHA ADULTO SEG-SEX',1,'un',26,26),
    line('16546','TAPIOCA QUEIJO E PRESUNTO BUFFET',1,'un',0,0),
    line('16535','OVO MEXIDO BUFFET',1,'un',0,0),
    line('0','GORJETA',1,'und',2.6,2.6)
  ];
  const second = original.map(x => ({ ...x, unit: x.unit === 'und' ? 'un' : x.unit }));
  const result = rules.mergeReceiptCandidates(original,second);
  assert.equal(result.length,4);
  assert.equal(result.reduce((sum,item)=>sum + item.lineTotal,0),28.6);
  assert.equal(result.filter(item=>item.lineTotal===0).length,2);
  const comparison = rules.compareInvoiceItems(result, second);
  assert.ok(comparison.every(row=>row.status==='Confere'),
    'UND and UN are equivalent while zero-cost fiscal lines remain present');
});
