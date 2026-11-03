const test = require('node:test');
const assert = require('node:assert/strict');
const kernel = import('../lib/receipt-original.mjs');
const payload = (text,mime='application/xml') => ({base64:Buffer.from(text).toString('base64'),mime,fileName:'nota.xml'});

test('XML permanece texto, incluindo conteúdo que jamais deve ser executado',async () => {
  const {prepareReceiptOriginal} = await kernel;
  const result = prepareReceiptOriginal(payload('<nota><script>alert(1)</script><codigo>000123</codigo></nota>'));
  assert.equal(result.kind,'xml'); assert.ok(result.text.includes('<codigo>000123</codigo>'));
  assert.equal(result.text,'<nota><script>alert(1)</script><codigo>000123</codigo></nota>');
});

test('recusa HTML, SVG, MIME falso e base64 inválido antes de criar qualquer blob',async () => {
  const {prepareReceiptOriginal} = await kernel;
  for (const mime of ['text/html','image/svg+xml','application/octet-stream','image/png','application/pdf']) {
    assert.throws(() => prepareReceiptOriginal(payload('<html>não é imagem</html>',mime)));
  }
  assert.throws(() => prepareReceiptOriginal({base64:'!!!=',mime:'application/xml'}));
});

test('mantém limite de 4 MB, aceita base64 quebrado em linhas e sanitiza nome',async () => {
  const {prepareReceiptOriginal} = await kernel;
  assert.throws(() => prepareReceiptOriginal(payload('x'.repeat(4_000_001))));
  const result=prepareReceiptOriginal({...payload('<nota/>'),fileName:'../nota\u0000.xml',base64:'PG5v\n dGEvPg=='});
  assert.equal(result.text,'<nota/>'); assert.equal(result.fileName,'.._nota_.xml');
});
