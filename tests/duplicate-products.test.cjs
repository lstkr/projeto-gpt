const test = require('node:test');
const assert = require('node:assert/strict');

const utils = import('../lib/duplicate-products.mjs');
const prod = (id, name, sku, unit = 'un', supplierCodes = []) =>
  ({ id, name, sku, unit, supplierCodes, stock: 5 });

test('normaliza zeros apenas em partes numericas, preservando prefixos', async () => {
  const { normalizeProductCode } = await utils;
  assert.equal(normalizeProductCode('00123'), '123');
  assert.equal(normalizeProductCode('123'), '123');
  assert.equal(normalizeProductCode('ABC-00123'), 'ABC-123');
  assert.equal(normalizeProductCode('ABC-123'), 'ABC-123');
  assert.notEqual(normalizeProductCode('B-00123'), normalizeProductCode('A-00123'));
  assert.equal(normalizeProductCode('000'), '0');
});

test('identifica SKU 00123 e 123 com descricao semelhante e unidade igual', async () => {
  const { findPotentialDuplicates } = await utils;
  const items = [prod('a', 'Leite integral 1 L', '00123', 'L'),
    prod('b', 'LEITE INT. 1L', '123', 'l')];
  const pairs = findPotentialDuplicates(items);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].confidence, 'alta');
  assert.equal(pairs[0].similarity, 100);
});

test('detecta mesmo codigo do fornecedor em suas duas grafias', async () => {
  const { findPotentialDuplicates } = await utils;
  const items = [prod('a', 'Cafe em graos 1 KG', 'CAF-X', 'kg', [{ cnpj: '12345678000199', code: '00123' }]),
    prod('b', 'Café grãos 1 kg', 'CAF-Y', 'kg', [{ cnpj: '12345678000199', code: '123' }])];
  const pair = findPotentialDuplicates(items)[0];
  assert.equal(pair.confidence, 'alta');
  assert.ok(pair.reasons.some((r) => r.includes('Código equivalente')));
});

test('nao usa codigo identico de fornecedores distintos como prova', async () => {
  const { findPotentialDuplicates } = await utils;
  assert.deepEqual(findPotentialDuplicates([
    prod('a', 'Acucar refinado', 'ABC', 'kg', [{ cnpj: '11111111000111', code: '00123' }]),
    prod('b', 'Copo descartavel', 'DEF', 'un', [{ cnpj: '22222222000122', code: '123' }])
  ]), []);
});

test('aponta possivel erro no codigo somente se descricao sustentar', async () => {
  const { findPotentialDuplicates } = await utils;
  const list = [prod('a', 'Farinha de trigo branca', '001235', 'kg'),
    prod('b', 'Farinha trigo branca', '001236', 'kg')];
  assert.equal(findPotentialDuplicates(list)[0].confidence, 'revisar');
  assert.deepEqual(findPotentialDuplicates([
    prod('a', 'Farinha de trigo branca', '001235', 'kg'),
    prod('b', 'Sabao em po', '001236', 'kg')
  ]), []);
});

test('nomes semelhantes com codigos distintos exigem analise humana', async () => {
  const { findPotentialDuplicates } = await utils;
  const results = findPotentialDuplicates([
    prod('a', 'Açúcar refinado', 'CODE-18', 'kg'),
    prod('b', 'Acucar refinado', 'CODE-93', 'kg')
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].confidence, 'revisar');
});

test('embalagens distintas e unidades diferentes nao sao alta confianca', async () => {
  const { findPotentialDuplicates } = await utils;
  const list = [prod('a', 'Leite Integral 1L', '00123', 'l'),
    prod('b', 'Leite Integral 2L', '123', 'un'),
    prod('c', 'Leite Integral 1L', '987', 'cx')];
  const pairs = findPotentialDuplicates(list);
  assert.ok(pairs.length >= 1);
  assert.ok(pairs.every((p) => p.confidence === 'revisar'));
  assert.ok(pairs.some((p) => p.reasons.some((reason) => reason.includes('Unidades diferentes'))));
});

test('nao confunde nomes semelhantes com volumes diferentes sem codigo equivalente', async () => {
  const { findPotentialDuplicates } = await utils;
  const list = [prod('a', 'Chocolate 40%', 'CH-040', 'kg'),
    prod('b', 'Chocolate 70%', 'CH-070', 'kg')];
  assert.equal(findPotentialDuplicates(list).length, 0);
});

test('ignora sku automatico e nao altera os produtos originais', async () => {
  const { findPotentialDuplicates } = await utils;
  const original = [prod('a', 'Azeite', 'PRD-12345', 'l'),
    prod('b', 'Tomate', 'PRD-12345', 'kg')];
  const snapshot = JSON.stringify(original);
  assert.equal(findPotentialDuplicates(original).length, 0);
  assert.equal(JSON.stringify(original), snapshot);
});

test('auditora item candidato sem inserir ou fundir saldos', async () => {
  const { findDuplicatesForCandidate } = await utils;
  const catalog = [prod('a', 'Manteiga sem sal 200g', '00123', 'un')];
  const candidate = prod('preview-new', 'Manteiga sem sal 200 g', '123', 'un');
  const matches = findDuplicatesForCandidate(candidate, catalog);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].confidence, 'alta');
  assert.equal(catalog.length, 1);
});
