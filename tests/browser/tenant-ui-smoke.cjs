// Runs against a local production build; all external requests are intercepted.
// PLAYWRIGHT_MODULE should name an installed playwright package directory.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const origin = process.env.ESTOQUE_BROWSER_URL || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Local server required');
const output = path.join(__dirname, 'artifacts');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ESTOQUE_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let cases = 0;
  try {
    for (const scenario of ['superadmin', 'password', 'admin']) {
      const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
      const page = await context.newPage();
      const calls = [];
      let token = 'mock-session-original';
      let activeTenantId = 'unit-one';
      const role = scenario === 'superadmin' ? 'superadmin' : 'admin';
      const user = { id: 'mock-user', username: 'ui.fixture', display_name: 'Usuário de homologação', role };
      const establishments = [{ id: 'unit-one', name: 'Unidade de teste A' }, { id: 'unit-two', name: 'Unidade de teste B' }];
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (!url.hostname.endsWith('.supabase.co')) return route.abort();
        const name = url.pathname.split('/').at(-1);
        if (!url.pathname.startsWith('/rest/v1/rpc/')) return route.abort();
        const args = request.postDataJSON() || {};
        calls.push({ name, args });
        let data;
        if (name === 'inventory_login') data = { ok: true, session_token: token };
        else if (name === 'inventory_tenants') data = { user, role, tenants: establishments, activeTenantId, mustChangePassword: scenario === 'password' };
        else if (name === 'inventory_get') data = { user, revision: 0, products: [{ id: 'p1', name: 'Produto de homologação', sku: '00012', category: 'Teste', unit: 'kg', stock: 1, min: 3, cost: 5 }], movements: [], documents: [] };
        else if (name === 'inventory_directory') data = { establishments, users: [{ id: 'u1', username: 'fixture.manager', displayName: 'Gestor de teste', role: 'admin', active: true, tenantIds: ['unit-one'] }] };
        else if (name === 'inventory_permissions_list') data = { self: {}, users: [] };
        else if (name === 'cash_closings_list' || name === 'pending_receipts_list') data = [];
        else if (name === 'inventory_select_tenant') { token = 'mock-session-rotated'; activeTenantId = args.p_tenant_id; data = { ok: true, session_token: token }; }
        else if (name === 'inventory_logout' || name === 'inventory_password_change') data = { ok: true };
        else throw new Error('Unexpected mocked RPC: ' + name);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
      });
      await page.goto(origin);
      await page.getByLabel('Login', { exact: true }).fill('fixture.user');
      await page.getByLabel('Senha', { exact: true }).fill('Synthetic-password-only-123');
      await page.getByRole('button', { name: 'Entrar no estoque', exact: true }).click();
      if (scenario === 'superadmin') {
        await page.getByRole('heading', { name: 'Administração DBA', exact: true }).waitFor();
        assert.equal(await page.locator('.navigation').count(), 0);
        assert.equal(calls.filter((call) => call.name === 'inventory_get').length, 0);
        await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Unidade fictícia');
        await page.screenshot({ path: path.join(output, 'dba-desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(output, 'dba-mobile.png'), fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      } else if (scenario === 'password') {
        await page.getByRole('heading', { name: 'Defina sua nova senha', exact: true }).waitFor();
        assert.equal(await page.locator('.navigation').count(), 0);
        assert.equal(calls.filter((call) => call.name === 'inventory_get').length, 0);
        assert.equal(await page.getByRole('heading', { name: 'Novo usuário', exact: true }).count(), 0);
        await page.screenshot({ path: path.join(output, 'password-gate.png'), fullPage: true });
      } else {
        await page.getByRole('button', { name: 'Lista de compras', exact: true }).click();
        await page.getByRole('button', { name: 'Imprimir lista de compras', exact: true }).waitFor();
        await page.evaluate(() => { window.addEventListener('beforeprint', () => {}, { once: true }); });
        await page.getByRole('button', { name: 'Imprimir lista de compras', exact: true }).click();
        const frame = page.frameLocator('iframe[title="Impressão da lista de compras"]');
        await frame.getByRole('heading', { name: 'Lista de compras', exact: true }).waitFor();
        await frame.getByText('Produto de homologação', { exact: false }).waitFor();
        await page.screenshot({ path: path.join(output, 'purchases-desktop.png'), fullPage: true });
        await page.getByRole('button', { name: 'Estabelecimentos e equipe', exact: true }).click();
        await page.getByLabel('Estabelecimento ativo', { exact: true }).selectOption('unit-two');
        await page.getByRole('button', { name: 'Acessar estabelecimento', exact: true }).click();
        await page.waitForFunction(() => sessionStorage.getItem('projeto-gpt-session') === 'mock-session-rotated');
        await page.getByRole('button', { name: 'Estabelecimentos e equipe', exact: true }).waitFor();
        assert.ok(calls.some((call) => call.name === 'inventory_select_tenant'));
        assert.ok(calls.some((call) => call.name === 'inventory_get' && call.args.p_session_token === 'mock-session-rotated'));
      }
      assert.deepEqual(errors, [], scenario + ' browser errors');
      cases++;
      console.log('PASS ' + scenario);
      await context.close();
    }
    console.log('PASS ' + cases + ' isolated browser scenarios; no external requests released');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
