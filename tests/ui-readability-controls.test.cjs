const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'pages/index.js'), 'utf8');
const css = readFileSync(join(root, 'styles/globals.css'), 'utf8');

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
  const buttons = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(match => match[0]);
  assert.ok(buttons.length > 0);
  buttons.forEach(button => assert.match(button, /type="(?:button|submit)"/));
  const cashButton = buttons.find(button => button.includes('cashSaving||!accessCode'));
  assert.ok(cashButton);
  assert.match(cashButton, /type="submit"/);
});

test('count and invoice name, unit and product controls have accessible names', () => {
  const controls = [...source.matchAll(/<(?:input|textarea)\b[\s\S]*?\/>|<select\b[\s\S]*?<\/select>/g)].map(match => match[0]);
  const targets = ['countDraft[p.id]', "fieldStyle('produto')", "fieldStyle('unidade')", "value={it.productId || ''}"];
  targets.forEach(target => {
    const matching = controls.filter(control => control.includes(target));
    assert.ok(matching.length > 0, target);
    matching.forEach(control => assert.match(control, /aria-label=\{[^}]+\}/, target));
  });
});

test('mobile row actions and buttons keep a minimum 44px touch target', () => {
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 850px)'));
  assert.match(mobile, /\.row-actions button, \.row-chevron\s*\{[^}]*width: 44px; height: 44px/);
  assert.match(mobile, /\.btn\s*\{ min-height: 44px/);
});
