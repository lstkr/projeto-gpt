const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const view = readFileSync(join(root, 'pages/index.js'), 'utf8');
const styles = readFileSync(join(root, 'styles/globals.css'), 'utf8');
const dialogHook = readFileSync(join(root, 'components/useAccessibleDialog.js'), 'utf8');

test('mobile alerts keep text-only critical actions readable', () => {
  assert.match(view, /Contagem obrigatória pendente/);
  assert.match(view, />Conferir agora<\/button>/);
  const mobileAlertRule = styles.match(/\.alert-strip\s*>\s*button\s*\{[^}]*\}/g) || [];
  assert.ok(mobileAlertRule.length >= 2, 'expected base and mobile alert rules');
  assert.ok(mobileAlertRule.every((rule) => !/font-size:\s*0\s*(?:;|\})/.test(rule)));
  assert.match(mobileAlertRule.at(-1), /font-size:\s*12px/);
  assert.match(mobileAlertRule.at(-1), /min-height:\s*44px/);
});

test('all navigation entries preserve an accessible name when sidebar labels are hidden', () => {
  const menu = view.slice(view.indexOf('<nav className="navigation"'), view.indexOf('</nav>'));
  const entries = ['Estoque', 'Contagem de estoque', 'Possíveis duplicatas',
    'Notas fiscais', 'Movimentações', 'Fechamento de caixa', 'Lista de compras', 'Gestor · Permissões', 'Estabelecimentos e equipe', 'Fornecedores'];
  entries.forEach((name) => assert.ok(menu.includes('aria-label="' + name + '"'), name));
  assert.equal((menu.match(/aria-current=/g) || []).length, entries.length);
});

test('operational dialogs have accessible titles and close controls', () => {
  const titles = ['product-dialog-title', 'merge-dialog-title',
    'adjust-dialog-title', 'details-dialog-title'];
  titles.forEach((id) => {
    assert.ok(view.includes('aria-labelledby="' + id + '"'), 'missing dialog label ' + id);
    assert.ok(view.includes('id="' + id + '"'), 'missing labelled title ' + id);
  });
  for (const action of ['Fechar cadastro de produto', 'Fechar consolidação de produtos',
    'Fechar ajuste de estoque', 'Fechar detalhes do documento']) {
    assert.ok(view.includes('aria-label="' + action + '"'), action);
  }
  assert.match(view, /useAccessibleDialog\(activeDialog,/);
});

test('dialog keyboard lifecycle handles Escape, Tab, focus return and background isolation', () => {
  assert.match(dialogHook, /event\.key === 'Escape'/);
  assert.match(dialogHook, /event\.key !== 'Tab'/);
  assert.match(dialogHook, /event\.shiftKey/);
  assert.match(dialogHook, /element\.inert = true/);
  assert.match(dialogHook, /element\.inert = previousInert\[index\]/);
  assert.match(dialogHook, /openerRef\.current/);
  assert.match(dialogHook, /document\.addEventListener\('pointerdown', rememberOpener/);
  assert.match(dialogHook, /dialog\.contains\(activeElement\)/);
  assert.match(dialogHook, /previouslyFocused\.focus/);
  assert.match(dialogHook, /removeEventListener\('keydown'/);
});

test('critical icon-only product actions and notification close carry accessible labels', () => {
  assert.match(view, /aria-label=\{'Ajustar estoque de ' \+ p\.name\}/);
  assert.match(view, /aria-label=\{'Remover ' \+ \(it\.name \|\| 'item'\) \+ ' da nota'\}/);
  assert.match(view, /aria-label="Dispensar notificação"/);
});

test('invoice details cannot close through Escape, backdrop, X or footer during deletion', () => {
  assert.match(view, /useAccessibleDialog\(activeDialog,\s*\(\) => \{/);
  assert.match(view, /else if \(detailDoc\) \{\s*if \(!deletingDocId\)/);
  assert.match(view, /e\.target === e\.currentTarget && !deletingDocId/);
  assert.match(view, /aria-label="Fechar detalhes do documento" disabled=\{Boolean\(deletingDocId\)\}/);
  assert.match(view, /disabled=\{Boolean\(deletingDocId\)\} onClick=\{\(\) => \{setDetailDoc\(null\);setDeleteError\(''\);\}\}>Fechar detalhes/);
});

