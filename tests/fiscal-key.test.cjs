const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../lib/fiscal-key.mjs');

function makeKey(issuer, model = '65') {
  const base = '352610' + issuer + model + '0010000001231' + '12345678';
  assert.equal(base.length, 43);
  let sum = 0, weight = 2;
  for (let index = 42; index >= 0; index--) {
    sum += (base.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return base + String(remainder < 2 ? 0 : 11 - remainder);
}

test('numeric NFC-e key validates and yields the issuer CNPJ', async () => {
  const { validateNfceAccessKey, issuerCnpjFromNfceAccessKey } = await api;
  const key = makeKey('11222333000181');
  assert.equal(validateNfceAccessKey(key), true);
  assert.equal(issuerCnpjFromNfceAccessKey(key), '11222333000181');
  assert.equal(validateNfceAccessKey(key.slice(0, 43) + (Number(key[43]) + 1) % 10), false);
  assert.equal(issuerCnpjFromNfceAccessKey(makeKey('11222333000181', '55')), '');
});

test('alphanumeric issuer key uses Receita ASCII-minus-48 check digit and CNPJ validation', async () => {
  const { validateNfceAccessKey, issuerCnpjFromNfceAccessKey } = await api;
  const key = makeKey('12ABC34501DE35');
  assert.equal(validateNfceAccessKey(key), true);
  assert.equal(issuerCnpjFromNfceAccessKey(key), '12ABC34501DE35');
  assert.equal(issuerCnpjFromNfceAccessKey(makeKey('12ABC34501DE34')), '');
});

test('text extraction finds a validated key among labels and grouped separators', async () => {
  const { extractNfceAccessKeyFromText } = await api;
  const key = makeKey('11222333000181');
  assert.equal(extractNfceAccessKeyFromText('CHAVE DE ACESSO: ' + key.match(/.{1,4}/g).join(' ')), key);
  assert.equal(extractNfceAccessKeyFromText('Texto com chave incompleta 12345'), '');
});
