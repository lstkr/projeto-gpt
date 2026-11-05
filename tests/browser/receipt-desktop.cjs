const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.ESTOQUE_BROWSER_URL || 'http://127.0.0.1:3000';
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Somente servidor local');

/** Não libera conexão externa nem usa contas ou notas reais. */
async function mockFiscalRequests(page, writes) {
  const user = {id: 'fixture.manager', role: 'admin', display_name: 'Gestor sintético'};
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return route.abort();
    const name = url.pathname.split('/').at(-1);
    const responses = {
      inventory_login: {ok: true, session_token: 'synthetic-session'},
      inventory_tenants: {user, tenants: [{id: 'fixture.unit', name: 'Unidade sintética'}], activeTenantId: 'fixture.unit'},
      inventory_get: {user, revision: 0, products: [{id:'synthetic.product',name:'Produto sintético com descrição longa para testar ações do catálogo',sku:'00042',category:'Teste',unit:'un',stock:2,cost:10}], movements: [], documents: []},
      inventory_permissions_list: {self: {'fiscal.pending.read': true, 'fiscal.pending.review': true, 'fiscal.pending.create': true}, users: []},
      pending_receipts_list: [], cash_closings_list: [],
      inventory_validate_session: {ok: true, valid: true}
    };
    if (name === 'inventory_save') writes.push(request.postDataJSON());
    assert.ok(name in responses, 'RPC inesperada: ' + name);
    await route.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(responses[name])});
  });
}

/** Mantém o roteiro junto para conferir a sequência real de foco sem lançar a nota. */
async function verifyReview(browser) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const writes = [];
  await mockFiscalRequests(page, writes);
  await page.goto(origin);
  await page.getByLabel('Login', {exact: true}).fill('synthetic.manager');
  await page.getByLabel('Senha', {exact: true}).fill('Synthetic-only-123');
  await page.getByRole('button', {name: 'Entrar no Giro', exact: true}).click();
  await page.locator('.stock-catalog-table .row-actions button').first().waitFor();
  for (const width of [1254,1024,390]) {
    await page.setViewportSize({width,height:900});
    const actions=await page.locator('.stock-catalog-table .row-actions').evaluateAll(nodes=>nodes.map(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,viewport:innerWidth})));
    assert.ok(actions.length && actions.every(box=>box.left>=0 && box.right<=box.viewport),'Ações fora da tela em '+width+' '+JSON.stringify(actions));
  }
  await page.getByRole('button',{name:'Entrada manual',exact:true}).click();
  await page.getByRole('heading',{name:'Entrada manual no estoque',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button', {name: 'Notas fiscais', exact: true}).click();
  assert.equal(await page.getByRole('button',{name:'Entrada manual',exact:true}).count(),0);
  await page.getByRole('button', {name: 'Cadastrar nota manualmente', exact: true}).click();
  const review = page.locator('.review-panel');
  await review.getByText('Pendente:', {exact: true}).waitFor();
  assert.match(await page.locator('.receipt-review-guide').innerText(), /1 linha\(s\)/);
  await review.locator('input').first().focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.review-panel') !== null), true);
  await page.keyboard.press('Shift+Tab');
  await page.evaluate(() => {
    window.receiptEnterPrevented = [];
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') window.receiptEnterPrevented.push(event.defaultPrevented);
    });
  });
  const first = review.locator('input:not([type="checkbox"]):not(:disabled)').first();
  await first.focus();
  await page.keyboard.press('Tab');
  await page.evaluate(() => {window.receiptTabTarget = document.activeElement;});
  await first.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement === window.receiptTabTarget),true);
  await page.keyboard.press('Shift+Enter');
  assert.equal(await first.evaluate(control => document.activeElement === control),true);
  for (const field of await review.locator('input:not([type="checkbox"]):not(:disabled)').all()) await field.press('Enter');
  const prevented = await page.evaluate(() => window.receiptEnterPrevented);
  assert.ok(prevented.length >= 8 && prevented.every(Boolean), 'Enter precisa ser bloqueado nos campos');
  assert.equal(writes.length, 0, 'Navegar e pressionar Enter não lança estoque');
  await review.getByRole('link', {name: 'Ir aos totais', exact: true}).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'receipt-review-totals');
  for (let index=0;index<14;index++) await review.getByRole('button',{name:'Adicionar item',exact:true}).click();
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({width, height: 900});
    const items = review.locator('.receipt-items-table');
    const dimensions = await items.evaluate(element => ({height:element.clientHeight,content:element.scrollHeight}));
    assert.ok(dimensions.content <= dimensions.height + 2,'Lista deve crescer sem rolagem interna');
    const overflow = await page.evaluate(() => ({overflow: document.documentElement.scrollWidth > innerWidth,
      outside: [...document.querySelectorAll('body *')].filter(el => el.scrollWidth > el.clientWidth + 2 && !el.closest('.table-wrap')).slice(0,15).map(el => ({name: el.className, text: el.textContent.slice(0,40), width: el.clientWidth, scroll: el.scrollWidth}))}));
    assert.equal(overflow.overflow, false, width+'px '+JSON.stringify(overflow.outside));
  }
  console.log('PASS conferência real: pendências visíveis, Tab/Shift+Tab, Enter seguro, navegação e sem overflow externo');
  await page.close();
}

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.ESTOQUE_CHROME_PATH ? {executablePath: process.env.ESTOQUE_CHROME_PATH} : {})});
  try {await verifyReview(browser);} finally {await browser.close();}
})().catch(error => {console.error(error.message); process.exitCode = 1;});
