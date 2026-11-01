const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parse } = require('next/dist/compiled/babel/parser');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'pages/index.js'), 'utf8');
const css = readFileSync(join(root, 'styles/globals.css'), 'utf8');

function visit(node, inspect) {
  if (!node || typeof node !== 'object') return;
  inspect(node);
  Object.values(node).forEach(value => {
    if (Array.isArray(value)) value.forEach(child => visit(child, inspect));
    else if (value && typeof value === 'object') visit(value, inspect);
  });
}

function luminance(hex) {
  const channels = hex.match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

test('secondary text tokens meet 4.5:1 on the shared light surfaces', () => {
  const surfaces = ['ffffff', 'f7f8f5', 'f1eee4', 'f7efcf', 'e9f2eb'];
  for (const token of ['muted', 'text-warm', 'text-positive', 'text-cool']) {
    const color = css.match(new RegExp('--' + token + ': #([a-f0-9]{6})'));
    assert.ok(color, token);
    surfaces.forEach(background => {
      const ratio = (luminance(background) + 0.05) / (luminance(color[1]) + 0.05);
      assert.ok(ratio >= 4.5, `${token} on #${background}: ${ratio}`);
    });
  }
  assert.doesNotMatch(css, /font-size:\s*(?:8|9|10|11)px\b/);
});

test('buttons declare their behavior and cash saving remains a submit action', () => {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let cashSubmit = false;
  visit(ast, node => {
    if (node.type !== 'JSXOpeningElement' || node.name.name !== 'button') return;
    const type = node.attributes.find(attribute => attribute.name?.name === 'type');
    assert.ok(['button', 'submit'].includes(type?.value?.value), `button at ${node.loc.start.line}`);
    if (source.slice(node.start, node.end).includes('cashSaving||!accessCode')) {
      cashSubmit = type.value.value === 'submit';
    }
  });
  assert.ok(cashSubmit);
});

test('count and invoice name, unit and product controls have accessible names', () => {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const targets = ['countDraft[p.id]', "fieldStyle('produto')", "fieldStyle('unidade')", "value={it.productId || ''}"];
  const found = new Set();
  visit(ast, node => {
    if (node.type !== 'JSXOpeningElement' || !['input', 'select'].includes(node.name.name)) return;
    const opening = source.slice(node.start, node.end);
    targets.filter(target => opening.includes(target)).forEach(target => {
      assert.ok(node.attributes.some(attribute => attribute.name?.name === 'aria-label'), target);
      found.add(target);
    });
  });
  assert.equal(found.size, targets.length);
});

test('mobile row actions and buttons keep a minimum 44px touch target', () => {
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 850px)'));
  assert.match(mobile, /\.row-actions button, \.row-chevron\s*\{[^}]*width: 44px; height: 44px/);
  assert.match(mobile, /\.btn\s*\{ min-height: 44px/);
});
