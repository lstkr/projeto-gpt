const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

test('pending receipt inline preview only accepts matching passive PDF and raster signatures', async () => {
  const { getPendingReceiptPreviewType } = await import('../lib/pending-receipt-preview.mjs');
  const cases = [
    ['application/pdf', [0x25,0x50,0x44,0x46,0x2d], 'application/pdf'],
    ['image/jpeg', [0xff,0xd8,0xff], 'image/jpeg'],
    ['image/png', [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 'image/png'],
    ['image/webp', [0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50], 'image/webp']
  ];
  for (const [mime, bytes, expected] of cases) {
    assert.equal(getPendingReceiptPreviewType(mime + '; charset=binary', new Uint8Array(bytes)), expected);
  }
  assert.equal(getPendingReceiptPreviewType('image/png', new Uint8Array([0xff,0xd8,0xff])), null);
  assert.equal(getPendingReceiptPreviewType('image/svg+xml', new TextEncoder().encode('<svg/>')), null);
  assert.equal(getPendingReceiptPreviewType('text/html', new TextEncoder().encode('<script/>')), null);
  assert.equal(getPendingReceiptPreviewType('application/octet-stream', new Uint8Array([0x25,0x50,0x44,0x46,0x2d])), null);
});

test('pending receipt download filenames are safe for a browser download attribute', async () => {
  const { safePendingReceiptFilename } = await import('../lib/pending-receipt-preview.mjs');
  assert.equal(safePendingReceiptFilename('nota.pdf'), 'nota.pdf');
  assert.equal(safePendingReceiptFilename('../nota.pdf'), '_nota.pdf');
  assert.equal(safePendingReceiptFilename('C:\\fakepath\\nota.pdf'), 'C__fakepath_nota.pdf');
  assert.equal(safePendingReceiptFilename(''), 'original');
  assert.ok(safePendingReceiptFilename('a'.repeat(220)).length <= 180);
});

test('QR privacy notice is inside the receipt banner and describes third-party transmission', () => {
  const page = readFileSync(join(root, 'pages/index.js'), 'utf8');
  const bannerStart = page.indexOf('<section className="document-banner">');
  const bannerEnd = page.indexOf('</section>', bannerStart);
  const banner = page.slice(bannerStart, bannerEnd);
  assert.match(banner, /<h2>Da nota fiscal para o estoque<\/h2>/);
  assert.match(banner, /document-privacy-note/);
  assert.match(banner, /envia automaticamente um recorte[\s\S]*serviço de terceiros/);
  assert.match(banner, /rel="noopener noreferrer"/);
  assert.doesNotMatch(page.slice(bannerEnd, bannerEnd + 300), /Privacidade do QR Code/);
});

test('pending receipt viewer validates MIME and bytes, prevents active formats, and keeps download', () => {
  const page = readFileSync(join(root, 'pages/index.js'), 'utf8');
  assert.match(page, /getPendingReceiptPreviewType\(data\.mime,dataBytes\)/);
  assert.match(page, /new Blob\(\[dataBytes\],\{type:safeType\}\)/);
  assert.match(page, /pendingPreview\.mime==='application\/pdf'/);
  assert.match(page, /pendingPreview\.mime==='application\/pdf'[\s\S]*<img alt=/);
  assert.match(page, /download=\{pendingPreview\.fileName\}>Baixar arquivo original/);
  assert.match(page, /URL\.revokeObjectURL\(pendingPreviewUrlRef\.current\)/);
  assert.match(page, /aria-labelledby="pending-file-title"/);
  assert.match(page, /role="alert"/);
  assert.doesNotMatch(page, /window\.open\([^)]*pendingPreview/);
});
