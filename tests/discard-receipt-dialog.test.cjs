const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'pages/index.js'), 'utf8');
const dialog = readFileSync(join(root, 'components/DiscardReceiptDialog.js'), 'utf8');

test('both review close actions open the accessible dialog before clearing anything', () => {
  const triggers = source.match(/onClick=\{\(\) => setDiscardReceiptOpen\(true\)\}/g) || [];
  assert.equal(triggers.length, 2);
  assert.doesNotMatch(source, /window\.confirm\('Descartar esta nota/);
  assert.match(source, /discardReceiptOpen \? 'discard-receipt'/);
  assert.match(source, /if \(discardReceiptOpen\) \{\s*setDiscardReceiptOpen\(false\)/);
});

test('confirming clears only the local review and file picker, with or without a mounted picker', () => {
  const handler = source.match(/function discardReceiptReview\(\) \{[\s\S]*?^  \}/m);
  assert.ok(handler);
  for (const picker of [{ value: 'synthetic.xml' }, null]) {
    const updates = {};
    const context = { uploadRef: { current: picker } };
    ['DiscardReceiptOpen', 'Draft', 'DraftQueue', 'DraftBatch', 'Error'].forEach(name => {
      context['set' + name] = value => { updates[name] = value; };
    });
    // Qualquer chamada adicional a rede ou estoque falha por não existir neste contexto.
    runInNewContext('(' + handler[0] + ')()', context);
    assert.equal(updates.DiscardReceiptOpen, false);
    assert.equal(updates.Draft, null);
    assert.equal(updates.DraftBatch, null);
    assert.equal(updates.Error, '');
    assert.equal(JSON.stringify(updates.DraftQueue), '[]');
    if (picker) assert.equal(picker.value, '');
  }
});

test('discard dialog has an accessible description and puts the safe action first', () => {
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(dialog, /aria-labelledby="discard-receipt-title" aria-describedby="discard-receipt-description"/);
  assert.match(dialog, /id="discard-receipt-title"/);
  assert.match(dialog, /id="discard-receipt-description"/);
  assert.match(dialog, /event\.target === event\.currentTarget\) onCancel\(\)/);
  assert.ok(dialog.indexOf('onClick={onCancel}') < dialog.indexOf('onClick={onConfirm}'));
  assert.match(dialog, /queuedCount > 0/);
});
