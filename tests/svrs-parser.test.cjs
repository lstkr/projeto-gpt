const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('tests/fixtures/nfce/nfce-svrs-sintetica.html', 'utf8');
const key = html.match(/class="chave">(\d+)/)[1];
const parse = async (source = html) => (await import('../lib/svrs-parser.mjs')).parseSvrsHtml(source);

test('SVRS preenche emitente e totais por rótulo mesmo com IDs repetidos', async () => {
  const result = await parse();
  assert.equal(result.supplierCnpj, '11222333000181');
  assert.equal(result.supplier, 'FORNECEDOR SINTETICO LTDA');
  assert.match(result.address, /Rua de Teste.*Cidade de Teste/);
  assert.equal(result.invoiceNumber, '000001');
  assert.equal(result.series, '1');
  assert.equal(result.date, '01/01/2026 10:00:00');
  assert.equal(result.contingency, true);
  assert.deepEqual(result.totalsCents, { subtotal: 9000, discount: 1000, total: 8000, change: 0, taxes: 900 });
  assert.deepEqual(result.payments, [{ method: 'Cartão de Crédito', amountCents: 8000, amount: 80 }]);
  assert.deepEqual(result.warnings, []);
});

test('SVRS CNPJ inválido usa chave válida; sem fonte válida devolve vazio e aviso', async () => {
  const invalid = html.replace('11.222.333/0001-81', '11.222.333/0001-80');
  assert.equal((await parse(invalid)).supplierCnpj, '11222333000181');
  const result = await parse(invalid.replace(key, '0'.repeat(44)));
  assert.equal(result.supplierCnpj, '');
  assert.match(result.warnings.join(' '), /inválido/);
});

test('SVRS não extrai CNPJ do consumidor e alerta divergência sem inventar valores', async () => {
  const result = await parse(html.replace('90,00', '91,00') + '<div><h4>Consumidor</h4><div>CNPJ: 45.723.174/0001-10 NOME PRIVADO</div></div>');
  assert.equal(result.totalsCents.subtotal, 9100);
  assert.match(result.warnings.join(' '), /Subtotal menos descontos/);
  assert.doesNotMatch(JSON.stringify(result), /45723174000110|NOME PRIVADO|Consumidor/);
});

test('campo CNPJ prioriza SVRS válida, depois XML/OCR; rejeita dígitos errados e letras', async () => {
  const {svrsDraftFields, validatedSupplierCnpj} = await import('../lib/svrs-draft.mjs');
  const data = await parse();
  const current = {supplier: 'OCR SINTETICO', supplierCnpj: '45723174000110'};
  assert.equal(svrsDraftFields(data, current).supplierCnpj, data.supplierCnpj);
  assert.equal(svrsDraftFields({...data, supplierCnpj: ''}, current).supplierCnpj, current.supplierCnpj);
  assert.equal(svrsDraftFields({...data, supplierCnpj: ''}, {ocrText: 'CNPJ:\n11 .222.333/0001-81'}).supplierCnpj, '11222333000181');
  for (const value of ['11222333000180','11111111111111','12ABC34501DE35','']) assert.equal(validatedSupplierCnpj(value), '');
  assert.equal(validatedSupplierCnpj('11.222.333/0001-81'), '11222333000181');
});

test('razão social oficial prevalece sobre apelido do catálogo sem mudar encargos existentes', async () => {
  const {prepareFiscalIdentity} = await import('../lib/fiscal-identity.mjs');
  const {svrsDraftFields} = await import('../lib/svrs-draft.mjs');
  const data = await parse();
  const draft = {items: [], officialOrigin: 'sefaz', additionalCharges: 3, ...svrsDraftFields(data)};
  const result = prepareFiscalIdentity(draft, null, [], [], [{cnpj: data.supplierCnpj, name: 'Apelido sintético'}]);
  assert.equal(result.supplier, data.supplier);
  assert.equal(result.additionalCharges, 3);
});

test('OCR reconhece espaços e quebra de linha sem escolher consumidor nem corrigir dígito por chute', async () => {
  const {extractIssuerCnpj} = await import('../lib/fiscal-identity.mjs');
  assert.equal(extractIssuerCnpj('EMITENTE SINTETICO - CNPJ:\n11 .222.333/0001-81'), '11222333000181');
  assert.equal(extractIssuerCnpj('CNPJ: 11 .222.333/0001-80'), '');
  assert.equal(extractIssuerCnpj('CONSUMIDOR CNPJ: 11.222.333/0001-81'), '');
});

test('XML, OCR, reabertura e rascunho usam validador; tela marca CNPJ pendente', () => {
  const view = fs.readFileSync('pages/index.js', 'utf8');
  assert.ok(view.includes("supplierCnpj: validatedSupplierCnpj(find(emit, 'CNPJ'))"));
  assert.ok(view.includes('return validatedSupplierCnpj(extractIssuerCnpj(text))'));
  assert.ok(view.includes('supplierCnpj:validatedSupplierCnpj(clean.supplierCnpj)'));
  assert.ok(view.includes('supplierCnpj:validatedSupplierCnpj(row.draft.supplierCnpj)||detectSupplierCnpj(row.draft.ocrText)'));
  assert.match(view, /Pendente: CNPJ ausente ou inválido/);
  assert.ok(view.includes('...svrsDraftFields(data, d)'));
});

test('endpoint preserva leitura dos itens e entrega campos da consulta sem rede', async () => {
  const {pathToFileURL} = require('node:url');
  const path = require('node:path');
  let source = fs.readFileSync('pages/api/consulta-nfce.js', 'utf8')
    .replace(/import \{ requireInventorySession \}[^;]+;/, 'const requireInventorySession = async () => true;')
    .replace(/import \{ enforceFiscalRateLimit \}[^;]+;/, 'const enforceFiscalRateLimit = async () => true;')
    .replace("'../../lib/svrs-parser.mjs'", JSON.stringify(pathToFileURL(path.resolve('lib/svrs-parser.mjs')).href))
    .replace("'cheerio'", JSON.stringify(pathToFileURL(require.resolve('cheerio')).href));
  const {default: handler} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const originalFetch = global.fetch;
  let responseHtml = html.replace('12,0000','12,3555');
  global.fetch = async () => new Response(responseHtml, {headers: {'content-type':'text/html'}});
  const response = {setHeader() {}, status(code) {this.code=code; return this;}, json(body) {this.body=body;}};
  const request = {method:'POST', body:{url:'https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p='+key+'|2'}};
  try {
    await handler(request,response);
    assert.equal(response.code,200);
    assert.equal(response.body.items.length,7);
    assert.equal(response.body.items[3].quantity,2.5);
    assert.equal(response.body.items[3].unitPrice,12.3555);
    assert.equal(response.body.items[3].lineTotal,30);
    assert.equal(response.body.items[0].code,'00001');
    assert.equal(response.body.supplierCnpj,'11222333000181');
    assert.equal(response.body.totals.total,80);
    responseHtml=html.replace(key,'0'.repeat(44));
    await handler(request,response);
    assert.equal(response.code,502);
  } finally {global.fetch=originalFetch;}
});
