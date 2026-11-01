const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');

async function withBrowser(options, run) {
  const originals = {Image: global.Image, document: global.document,
    create: URL.createObjectURL, revoke: URL.revokeObjectURL};
  const evidence = {qualities: [], revoked: false};
  const canvas = {width: 0, height: 0, getContext: () => ({
    fillRect() {}, drawImage() { evidence.dimensions = [canvas.width, canvas.height]; }
  }), toBlob(callback, type, quality) {
    evidence.qualities.push(quality);
    callback(options.nullBlob ? null : new Blob([new Uint8Array(options.sizes.shift())], {type}));
  }};
  global.Image = class {
    naturalWidth = options.width || 4032;
    naturalHeight = options.height || 3024;
    async decode() { if (options.decodeError) throw new Error('decoder'); }
  };
  global.document = {createElement: () => canvas};
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => { evidence.revoked = true; };
  try { await run(evidence, canvas); } finally {
    global.Image = originals.Image; global.document = originals.document;
    URL.createObjectURL = originals.create; URL.revokeObjectURL = originals.revoke;
  }
}

test('arquivos pequenos e PDF grande permanecem intactos sem acessar navegador', async () => {
  const {prepareReceiptImageUpload} = await import('../lib/receipt-image-upload.mjs');
  for (const file of [{size: 4_000_000, type: 'image/jpeg', name: 'foto.jpg'},
    {size: 6_000_000, type: 'application/pdf', name: 'nota.pdf'}]) {
    assert.equal(await prepareReceiptImageUpload(file), file);
  }
});

test('foto grande mantém proporção e vira JPEG abaixo do limite sem alterar original', async () => {
  const {prepareReceiptImageUpload} = await import('../lib/receipt-image-upload.mjs');
  const original = Object.freeze({size: 6_000_000, type: 'image/jpeg', name: 'foto.jpeg'});
  await withBrowser({sizes: [4_100_000, 3_000_000]}, async (evidence, canvas) => {
    const result = await prepareReceiptImageUpload(original);
    assert.equal(result.size, 3_000_000);
    assert.equal(result.name, 'foto.jpg');
    assert.equal(result.type, 'image/jpeg');
    assert.deepEqual(evidence.dimensions, [3200, 2400]);
    assert.deepEqual(evidence.qualities, [0.92, 0.85]);
    assert.equal(evidence.revoked, true);
    assert.equal(canvas.width, 0);
    assert.equal(original.size, 6_000_000);
  });
});

test('foto vertical conserva orientação e não amplia imagens menores', async () => {
  const {prepareReceiptImageUpload} = await import('../lib/receipt-image-upload.mjs');
  await withBrowser({width: 1200, height: 2400, sizes: [100]}, async evidence => {
    await prepareReceiptImageUpload({size: 5_000_000, type: 'image/png', name: 'foto.png'});
    assert.deepEqual(evidence.dimensions, [1200, 2400]);
  });
});

test('formato incompatível, erro de conversão e excesso de tamanho liberam recursos', async () => {
  const {prepareReceiptImageUpload} = await import('../lib/receipt-image-upload.mjs');
  for (const options of [{decodeError: true}, {nullBlob: true},
    {sizes: [4_000_001, 4_000_001, 4_000_001]}]) {
    await withBrowser(options, async (evidence, canvas) => {
      await assert.rejects(prepareReceiptImageUpload({size: 6_000_000,
        type: 'image/heic', name: 'foto.heic'}), /Exporte como JPEG/);
      assert.equal(evidence.revoked, true);
      assert.equal(canvas.width, 0);
    });
  }
});

test('integração lê original no OCR e arquiva cópia reduzida sem retirar limite', () => {
  const source = readFileSync(require.resolve('../pages/index.js'), 'utf8');
  assert.match(source, /archiveFile = await prepareReceiptImageUpload\(file\);\s+const receipts = await parseUploadedFile\(file\)/);
  assert.match(source, /storePendingReceipt\(archiveFile,mapped\)/);
  assert.match(source, /storePendingReceipt\(archiveFile,fallback\)/);
  assert.match(source, /if\(file.size>4000000\)throw new Error/);
});
