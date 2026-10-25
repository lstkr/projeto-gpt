const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const view = readFileSync(join(root, 'pages/index.js'), 'utf8');
const styles = readFileSync(join(root, 'styles/globals.css'), 'utf8');
const dialogHook = readFileSync(join(root, 'components/useAccessibleDialog.js'), 'utf8');
const focusHook = readFileSync(join(root, 'components/useAccessibleFocus.js'), 'utf8');

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test('stock alerts meet readable contrast, size and persistent text requirements', () => {
  const background = '#fffaf0';
  assert.ok(contrastRatio('#655b46', background) >= 4.5);
  assert.ok(contrastRatio('#785d1b', background) >= 4.5);
  const title = styles.match(/\.alert-strip b\s*\{([^}]+)\}/)?.[1] || '';
  const message = styles.match(/\.alert-strip p\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(title, /font-size:\s*12px/);
  assert.match(message, /font-size:\s*12px/);
  assert.doesNotMatch(message, /overflow:\s*hidden|text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.match(view, /low\.length > 0 && <section className="alert-strip" role="status"/);
  assert.match(view, /className="alert-strip" role="alert"/);
});

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
    'Notas fiscais', 'Movimentações', 'Faturamento', 'Lista de compras', 'Fornecedores'];
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


test('manager settings remain available via profile while sidebar has no duplicate entry', () => {
  const menu = view.slice(view.indexOf('<nav className="navigation"'), view.indexOf('</nav>'));
  assert.doesNotMatch(menu, /aria-label="Estabelecimentos e equipe"/);
  assert.match(view, /role="menuitem" onClick=\{\(\)=>\{setAccountOpen\(false\);setMenuOpen\(false\);setView\('settings'\);\}\}>Configurações/);
  assert.match(view, /\(view === 'settings' \|\| \(view === 'administration' && currentUser\?\.role === 'admin'\)\) && <TenantAdministration/);
  assert.doesNotMatch(menu, /aria-label="Gestor · Permissões"/);
});

test('settings keep manager workflows and hide manager tools from employee accounts', () => {
  const administration = readFileSync(join(root, 'components/TenantAdministration.js'), 'utf8');
  for (const rpc of [
    'inventory_password_change', 'inventory_select_tenant', 'inventory_establishment_create',
    'inventory_user_create', 'inventory_admin_password_reset', 'inventory_directory',
    'inventory_manager_grant'
  ]) {
    assert.ok(administration.includes(rpc), 'missing settings operation: ' + rpc);
  }
  assert.match(administration, /const canManage = isDba \|\| user\?\.role === 'admin'/);
  assert.match(administration, /\{canManage && <>/);
  assert.match(administration, /\{isDba && <>/);
});

test('permissions move into the manager profile menu without changing their page', () => {
 const menu = view.slice(view.indexOf('<nav className="navigation"'), view.indexOf('</nav>'));
 assert.doesNotMatch(menu, /aria-label="Gestor · Permissões"/);
 assert.match(view, /currentUser\?\.role === 'admin' && <button type="button" role="menuitem" onClick=\{\(\)=>\{setAccountOpen\(false\);setMenuOpen\(false\);setView\('permissions'\);\}\}>Permissões<\/button>/);
 assert.match(view, /view === 'permissions'/);
});


test('focus moves once to opened tabs and panels, with opener restoration', () => {
  assert.ok(view.includes("useAccessibleFocus(view, '.content')"));
  assert.ok(view.includes("useAccessibleFocus(cashEntryMode, '.cash-entry:not(.cash-entry-collapsed)'"));
  assert.ok(view.includes('data-focus-scope="manual-entry"'));
  assert.ok(view.includes('data-focus-scope="manual-new"'));
  assert.ok(view.includes('data-focus-scope="count"'));
  assert.ok(focusHook.includes('previousKey.current === key'));
  assert.ok(focusHook.includes('requestAnimationFrame'));
  assert.ok(focusHook.includes('restoreFocus && opener.current?.isConnected'));
  assert.ok(focusHook.includes("scrollIntoView({ block: 'nearest'"));
  assert.ok(focusHook.includes("container.closest('[inert]')"));
});

test('dialog focus applies to every modal surface, including portaled dialogs', () => {
  assert.ok(dialogHook.includes("const DIALOG_SELECTOR = '[role=\"dialog\"][aria-modal=\"true\"]'"));
  assert.ok(!dialogHook.includes('.overlay [role="dialog"'));
  assert.ok(dialogHook.includes('focusFirstRelevant(dialog)'));
});
