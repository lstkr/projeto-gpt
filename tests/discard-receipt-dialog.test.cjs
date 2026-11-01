const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(join(__dirname, '../pages/index.js'), 'utf8');
const dialog = readFileSync(join(__dirname, '../components/DiscardReceiptDialog.js'), 'utf8');

function handler(name) {
  const match = source.match(new RegExp('function ' + name + '\\(\\) \\{[\\s\\S]*?^  \\}', 'm'));
  assert.ok(match, name);
  return match[0];
}

test('X discards a single note immediately but only opens confirmation for a queue', () => {
  for (const queuedCount of [0, 1, 3]) {
    const calls = [];
    runInNewContext('(' + handler('requestDiscardReceiptReview') + ')()', {
      draftQueue: Array(queuedCount),
      setDiscardReceiptOpen: value => calls.push(['open', value]),
      discardReceiptReview: () => calls.push(['discard'])
    });
    assert.deepEqual(calls, queuedCount ? [['open', true]] : [['discard']]);
  }
});

test('confirming preserves the original X cleanup without calling stock or network operations', () => {
  const updates = {};
  const picker = { value: 'synthetic.xml' };
  const context = { uploadRef: { current: picker } };
  ['DiscardReceiptOpen', 'Draft', 'DraftQueue', 'DraftBatch', 'Error'].forEach(name => {
    context['set' + name] = value => { updates[name] = value; };
  });
  runInNewContext('(' + handler('discardReceiptReview') + ')()', context);
  assert.equal(JSON.stringify(updates), '{"DiscardReceiptOpen":false,"Draft":null,"DraftQueue":[],"DraftBatch":null,"Error":""}');
  assert.equal(picker.value, '');
});

test('footer Cancelar remains immediate and confirmation text remains exactly the native question', () => {
  assert.ok(source.includes("onClick={() => {setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');}} type=\"button\">Cancelar</button>"));
  assert.match(dialog, /Descartar esta nota e os \{queuedCount\} documentos aguardando revisão\?/);
  assert.match(source, /onCancel=\{\(\) => setDiscardReceiptOpen\(false\)\}/);
  assert.match(source, /discardReceiptOpen \? 'discard-receipt'/);
  assert.doesNotMatch(source, /window\.confirm\('Descartar esta nota/);
});
