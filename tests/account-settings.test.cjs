const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const page = readFileSync(join(root, 'pages/index.js'), 'utf8');
const administration = readFileSync(join(root, 'components/TenantAdministration.js'), 'utf8');
const css = readFileSync(join(root, 'styles/globals.css'), 'utf8');

test('profile dropdown links to settings and closes the dropdown', () => {
  assert.match(page, /role="menuitem" onClick=\{\(\)=>\{setAccountOpen\(false\);setMenuOpen\(false\);setView\('settings'\);\}\}>Configurações/);
  assert.match(page, /view === 'settings' \? \['MINHA CONTA','Configurações'/);
});

test('account settings reuse protected management component for both roles', () => {
  assert.match(page, /view === 'settings' \|\| \(view === 'administration' && currentUser\?\.role === 'admin'\)/);
  assert.match(administration, /canManage = isDba \|\| user\?\.role === 'admin'/);
  assert.match(administration, /\{canManage && <>/);
});

test('signed-in user may change own password with explicit confirmation', () => {
  assert.match(administration, /id="own-password-title">Minha senha/);
  assert.match(administration, /submit\(event, 'inventory_password_change'/);
  assert.match(administration, /p_current_password: data\.get\('currentPassword'\)/);
  assert.match(administration, /p_new_password: data\.get\('newPassword'\)/);
  assert.match(administration, /data\.has\('confirmPassword'\)/);
  assert.match(administration, /A confirmação não corresponde à nova senha/);
  assert.match(administration, /operation === 'inventory_password_change'\) await onPasswordChanged\(\)/);
});

test('manager can reach employee reset, establishment and employee creation with server-side RPCs', () => {
  assert.match(administration, /inventory_admin_password_reset/);
  assert.match(administration, /record\.role === 'employee'/);
  assert.match(administration, /inventory_establishment_create/);
  assert.match(administration, /inventory_user_create/);
  assert.match(css, /\.tenant-settings-section/);
});
