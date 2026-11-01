const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('tests/fixtures/nfce/nfce-pgl-contingencia.html', 'utf8');
const parse = async (source = html) => (await import('../lib/svrs-parser.mjs')).parseSvrsHtml(source);

test('SVRS: preenche emitente, sete itens e totais impressos da página de contingência', async () => {
  const result = await parse();
  assert.equal(result.accessKey, '43261087397865000979652100002233569004539403');
  assert.equal(result.supplierCnpj, '87397865000979');
  assert.equal(result.supplier, 'PGL DISTRIBUICAO DE ALIMENTOS LTDA');
  assert.match(result.address, /Praca 20 de Setembro.*849.*FRAGATA.*Pelotas.*RS/);
  assert.equal(result.invoiceNumber, '223356');
  assert.equal(result.series, '210');
  assert.equal(result.date, '22/10/2026 15:56:24');
  assert.equal(result.contingency, true);
  assert.deepEqual(result.totalsCents, { subtotal: 82929, discount: 8744, total: 74185, change: 0, taxes: 11570 });
  assert.deepEqual(result.payments, [{ method: 'Cartão de Crédito', amountCents: 74185, amount: 741.85 }]);
  assert.deepEqual(result.items.map((item) => [item.code, item.quantityMillis, item.unitPriceCents, item.lineTotalCents]), [
    ['41160', 5000, 1199, 5995], ['115010010', 6000, 799, 4794], ['649370', 12000, 519, 6228],
    ['832360', 9868, 3990, 39373], ['524160', 11115, 2190, 24341],
    ['1023600', 1000, 1198, 1198], ['853450', 1000, 1000, 1000]
  ]);
  assert.equal(result.items[4].unit, 'kg');
  assert.equal(result.items[6].stockDisposition, 'expense');
  assert.deepEqual(result.warnings, []);
});

test('SVRS: desconto ausente é zero sem inventar fechamento', async () => {
  const result = await parse(html.replace(/<div id="linhaTotal"><label>Descontos R\$:<\/label>.*?<\/div>/, ''));
  assert.equal(result.totalsCents.discount, 0);
  assert.match(result.warnings.join(' '), /Subtotal menos descontos/);
});

test('SVRS: CNPJ ausente ou inválido usa o emitente da chave; divergência alerta', async () => {
  for (const replacement of ['', '00.000.000/0000-00', '11.222.333/0001-81']) {
    const result = await parse(html.replace('87.397.865/0009-79', replacement));
    assert.equal(result.supplierCnpj, replacement === '11.222.333/0001-81' ? '11222333000181' : '87397865000979');
    if (replacement) assert.match(result.warnings.join(' '), /CNPJ da página diverge/);
  }
});

test('SVRS: divergências alertam sem corrigir valores e um centavo por item é tolerado', async () => {
  const result = await parse(html.replace('829,29', '830,29').replace('243,41', '243,40'));
  assert.equal(result.totalsCents.subtotal, 83029);
  assert.equal(result.items[4].lineTotalCents, 24340);
  assert.match(result.warnings.join(' '), /Soma dos itens/);
  assert.match(result.warnings.join(' '), /Total do item diverge/);
});

test('SVRS: ignora consumidor, preserva zeros dos códigos e lê múltiplos pagamentos', async () => {
  const result = await parse(html.replace('41160', '0041160') + '<div><h4>Consumidor</h4><div class="text">CPF: 123.456.789-00 Nome: PESSOA PRIVADA</div></div>');
  assert.equal(result.items[0].code, '0041160');
  assert.doesNotMatch(JSON.stringify(result), /123.456.789|PESSOA PRIVADA|CPF/);
  const split = await parse(html.replace('<label class="tx">Troco', '<label class="tx">PIX</label><span class="totalNumb">1,00</span></div><div><label class="tx">Troco'));
  assert.equal(split.payments.length, 2);
});

test('SVRS: campos oficiais substituem metadados OCR sem duplicar frete ou apagar alertas', async () => {
  const { svrsDraftFields } = await import('../lib/svrs-draft.mjs');
  const parsed = await parse(html.replace('829,29', '830,29'));
  const draft = { additionalCharges: 10, supplierCnpj: '', ...svrsDraftFields(parsed) };
  for (const field of ['supplier', 'supplierCnpj', 'address', 'invoiceNumber', 'series', 'date', 'contingency', 'payments'])
    assert.deepEqual(draft[field], parsed[field]);
  assert.equal(draft.additionalCharges, 0);
  assert.equal(draft.taxes, 115.70);
  assert.equal(draft.change, 0);
  assert.deepEqual(draft.officialWarnings, parsed.warnings);
  assert.match(draft.totalsWarning, /Soma dos itens/);
});

test('SVRS: endpoint entrega todos os campos sem rede e rejeita outra chave na página', async () => {
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  let source = fs.readFileSync('pages/api/consulta-nfce.js', 'utf8')
    .replace(/import \{ requireInventorySession \}[^;]+;/, 'const requireInventorySession = async () => true;')
    .replace(/import \{ enforceFiscalRateLimit \}[^;]+;/, 'const enforceFiscalRateLimit = async () => true;')
    .replace("'../../lib/svrs-parser.mjs'", JSON.stringify(pathToFileURL(path.resolve('lib/svrs-parser.mjs')).href));
  const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const originalFetch = global.fetch;
  let responseHtml = html;
  global.fetch = async () => new Response(responseHtml, { headers: { 'content-type': 'text/html' } });
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const request = { method: 'POST', body: { url: 'https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=43261087397865000979652100002233569004539403|2' } };
  try {
    await handler(request, response);
    assert.equal(response.code, 200);
    assert.deepEqual(response.body.items, (await parse()).items);
    assert.equal(response.body.supplierCnpj, '87397865000979');
    assert.equal(response.body.totals.total, 741.85);
    assert.equal(response.body.source, 'SVRS');
    responseHtml = html.replace('4326 1087', '4326 1088');
    await handler(request, response);
    assert.equal(response.code, 502);
    assert.match(response.body.error, /não corresponde/);
  } finally { global.fetch = originalFetch; }
});
