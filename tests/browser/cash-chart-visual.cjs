// Run against a local Next.js production build with Playwright installed.
// No production data or external requests are used.
// ESTOQUE_BROWSER_URL=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=playwright node tests/browser/cash-chart-visual.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.env.ESTOQUE_BROWSER_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Only a local server may be tested');
const output = path.join(__dirname, 'artifacts');
fs.mkdirSync(output, { recursive: true });

const printProducts = [
  {id:'qa-milk',name:'Leite integral',sku:'000123',unit:'L',category:'Frios',
   stock:20,cost:98765,valuation:999999},
  {id:'qa-beans',name:'Café em grãos',sku:'CAF-001',unit:'kg',category:'Cafés',
   stock:2.5,cost:123456,valuation:999998}
];
const printCounts = [{id:'qa-count-1',completedAt:'2026-10-20T15:00:00Z',
  by:'QA',items:[{productId:'qa-milk',name:'Leite integral',expected:20,counted:19},
    {productId:'qa-beans',name:'Café em grãos',expected:2.5,counted:3}]}];

const closings = [
  {id:'chart-10',day:'2026-10-10',register:'001',operator:'QA',cartaoCredito:569,movements:[]},
  {id:'chart-17',day:'2026-10-17',register:'001',operator:'QA',cartaoCredito:783,movements:[]},
  {id:'chart-19',day:'2026-10-19',register:'001',operator:'QA',cartaoCredito:1178,movements:[]},
  {id:'chart-20a',day:'2026-10-20',register:'001',operator:'QA',cartaoCredito:1675.50,movements:[]},
  {id:'chart-20b',day:'2026-10-20',register:'002',operator:'QA',cartaoCredito:500,movements:[]},
  {id:'chart-21',day:'2026-10-21',register:'001',operator:'QA',cartaoCredito:999999.99,movements:[]}
];

(async () => {
  const launchOptions = { headless:true };
  if (process.env.ESTOQUE_CHROME_PATH) launchOptions.executablePath = process.env.ESTOQUE_CHROME_PATH;
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport:{width:1366,height:768} });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (!url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith('/rest/v1/rpc/')) return route.abort();
      const name = url.pathname.split('/').at(-1);
      let data;
      if (name === 'inventory_login') data = {ok:true,session_token:'visual-qa-session'};
      else if (name === 'inventory_tenants') data = {
        user:{id:'qa',username:'synthetic.qa',display_name:'QA',role:'admin'},
        role:'admin',tenants:[{id:'qa-unit',name:'Unidade QA'}],activeTenantId:'qa-unit',mustChangePassword:false
      };
      else if (name === 'inventory_get') data = {user:{id:'qa',username:'synthetic.qa',display_name:'QA',role:'admin'},revision:0,products:printProducts,movements:[],documents:[],stockCounts:printCounts};
      else if (name === 'inventory_directory') data = {establishments:[{id:'qa-unit',name:'Unidade QA'}],users:[]};
      else if (name === 'inventory_permissions_list') data = {self:{},users:[]};
      else if (name === 'cash_closings_list') data = closings;
      else if (name === 'pending_receipts_list') data = [];
      else if (name === 'inventory_logout') data = {ok:true};
      else throw new Error('Unmocked RPC: ' + name);
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
    });
    await page.goto(origin);
    await page.getByLabel('Login', {exact:true}).fill('synthetic.qa');
    await page.getByLabel('Senha', {exact:true}).fill('Visual-QA-only-password');
    await page.getByRole('button',{name:'Entrar no estoque',exact:true}).click();
    await page.getByRole('button',{name:'Fechamento de caixa',exact:true}).click();
    await page.locator('.cash-chart-controls input[type=month]').fill('2026-10');

    const columns = page.locator('.cash-chart-month .cash-bar-column');
    await columns.first().waitFor();
    assert.equal(await columns.count(),31,'outubro precisa exibir 31 dias');
    assert.equal(await page.locator('.cash-chart-month .cash-bar-column:not(:disabled)').count(),5,'mesmo dia com dois caixas deve ser uma só barra');
    const amountLabels = await columns.evaluateAll(items=>items.filter(item=>/R\$\s*[0-9]/.test(item.innerText)));
    assert.equal(amountLabels.length,0,'rótulos de moeda não podem ocupar o espaço estreito das colunas');

    for (const [width,height] of [[320,700],[375,812],[768,1024],[1024,768],[1366,768],[1920,1080]]) {
      await page.setViewportSize({width,height});
      const result = await page.evaluate(() => {
        const panel=document.querySelector('.cash-chart-inspector');
        const chart=document.querySelector('.cash-chart');
        const titles=Array.from(chart.querySelectorAll('.cash-bar-column small'));
        const rects=titles.map(el=>el.getBoundingClientRect());
        const overlaps=[];
        for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++){
          const a=rects[i],b=rects[j];
          if(a.right>b.left+.5&&b.right>a.left+.5&&a.bottom>b.top+.5&&b.bottom>a.top+.5) overlaps.push([i,j]);
        }
        return {panelBeforeChart:panel.getBoundingClientRect().bottom<=chart.getBoundingClientRect().top+1,overlaps,pageOverflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(result.panelBeforeChart,true,'painel de valor não deve sobrepor as barras');
      assert.deepEqual(result.overlaps,[],'rótulos dos dias não podem colidir em '+width+'px');
      assert.equal(result.pageOverflow,false,'a página não deve transbordar em '+width+'px; o próprio gráfico pode rolar');
      await page.screenshot({path:path.join(output,'cash-chart-'+width+'.png')});
    }

    const bar20=page.locator('.cash-chart-month .cash-bar-column[aria-label*="20 de outubro"]');
    await bar20.scrollIntoViewIfNeeded();
    await bar20.hover();
    assert.match(await page.locator('[data-testid="cash-chart-inspector"]').innerText(),/R\$\s*2\.175,50/,'o hover deve exibir a receita consolidada do dia');
    await bar20.focus();
    assert.match(await page.locator('[data-testid="cash-chart-inspector"]').innerText(),/2\.175,50/,'o foco por teclado deve informar o valor');
    await bar20.click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'Fechar detalhamento do dia'}).click();

    await page.locator('.cash-chart-controls input[type=month]').fill('2028-02');
    assert.equal(await columns.count(),29,'fevereiro bissexto precisa mostrar 29 dias');
    assert.equal(await columns.filter({has:page.locator('.cash-bar-fill')}).count(),29);

    // Stock count printing: previews must remain readable, modal and isolated.
    await page.getByRole('button',{name:'Contagem de estoque',exact:true}).click();
    await page.getByRole('button',{name:'Abrir prévia de impressão'}).click();
    const printDialog=page.getByRole('dialog',{name:/Prévia de impressão/});
    await printDialog.waitFor();
    const printFrame=page.frameLocator('iframe[title="Documento da contagem para impressão"]');
    assert.equal(await printFrame.locator('tbody tr').count(),2);
    assert.match(await printFrame.locator('h1').textContent(),/contagem cega/i);
    assert.match(await printFrame.locator('body').innerText(),/Unidade QA/,'impressão precisa identificar estabelecimento ativo');
    assert.doesNotMatch(await printFrame.locator('body').innerText(),/98765|999999|123456|999998|20.*L/);
    await page.getByRole('button',{name:'Imprimir documento'}).waitFor({state:'visible'});
    for(const [width,height] of [[320,700],[375,812],[768,1024],[1024,768],[1366,768],[1920,1080]]){
      await page.setViewportSize({width,height});
      const measured=await page.evaluate(()=>{
        const overlay=document.querySelector('.overlay');
        const dialog=overlay?.querySelector('[role=dialog]');
        const frame=dialog?.querySelector('iframe');
        if(!overlay||!dialog||!frame)return {missing:true};
        const box=dialog.getBoundingClientRect();
        return {missing:false,
          outOfBounds:box.left < -2 || box.right > innerWidth+2,
          clippedPreview:frame.clientWidth===0||frame.clientHeight===0,
          pageOverflow:document.documentElement.scrollWidth>innerWidth+2
        };
      });
      assert.equal(measured.missing,false,'prévia ausente em '+width+'px');
      assert.equal(measured.outOfBounds,false,'modal fora da tela em '+width+'px');
      assert.equal(measured.clippedPreview,false,'iframe cortado em '+width+'px');
      assert.equal(measured.pageOverflow,false,'rolagem horizontal indevida em '+width+'px');
      await page.screenshot({path:path.join(output,'count-preview-'+width+'.png')});
    }
    await page.getByRole('button',{name:'Fechar prévia'}).click();
    await page.getByLabel('Tipo de documento de contagem').selectOption('differences');
    await page.getByRole('button',{name:'Abrir prévia de impressão'}).click();
    await page.getByRole('dialog',{name:/Prévia de impressão/}).waitFor();
    assert.match(await printFrame.locator('h1').textContent(),/Relatório de conferência/);
    assert.match(await printFrame.locator('body').innerText(),/19/);
    assert.doesNotMatch(await printFrame.locator('body').innerText(),/98765|999999|123456|999998/);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog',{name:/Prévia de impressão/}).count(),0,'Escape deve fechar a prévia');
    console.log('PASS print preview: blind/differences, role-aware sheet, keyboard and six viewports');

    assert.deepEqual(errors,[],'não deve haver erros JavaScript no navegador');
    console.log('PASS visual QA: labels, consolidated totals, leap month, keyboard, hover and six viewports');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
