const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.ESTOQUE_BROWSER_URL || 'http://127.0.0.1:3000';
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Somente teste local');

/** API simulada: nenhum dado ou conexão real sai do navegador. */
async function mockReading(page, scenario, official) {
  const user={id:'fixture.manager',role:'admin',display_name:'Gestor sintético'};
  const draft={supplier:'OCR SINTETICO',supplierCnpj:scenario==='svrs'?'45723174000110':'',invoiceNumber:'1',date:'01/01/2026',
    ocrText:'EMITENTE SINTETICO CNPJ:\n11 .222.333/0001-'+(scenario==='invalid'?'80':'81'),
    source:'Foto',fileName:'sintetico.jpg',checkedBy:'',subtotal:90,discount:0,total:90,
    accessKey:official.accessKey,qrUrlPreserved:true,consultaUrl:'https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p='+official.accessKey+'|2',
    items:[{name:'ITEM SINTETICO',code:'00001',quantity:1,unit:'un',unitPrice:90,lineTotal:90}]};
  if(scenario==='danfe'){
    const base=official.accessKey.slice(0,20)+'55'+official.accessKey.slice(22,43);
    const remainder=[...base].reverse().reduce((sum,digit,index)=>sum+Number(digit)*(2+index%8),0)%11;
    draft.accessKey=base+(remainder<2?0:11-remainder);
    draft.consultaUrl='';draft.qrUrlPreserved=false;
    draft.ocrText='EMITENTE CNPJ/CPF: 11.222.333/0001-81\nDESTINATÁRIO / REMETENTE\nCNPJ: 45.723.174/0001-10';
  }
  if(scenario==='order') {
    draft.accessKey='';draft.consultaUrl='';draft.qrUrlPreserved=false;
    draft.ocrText='EMITENTE SINTETICO CNPJ:11.222.333/0001-81\nPEDIDO No:000042\nSEM VALOR FISCAL\nDESCRICAO\nBANDEJA SINTETICA 120 X 160\n500 ML C/10 UN.\n00017 2,50 4,00 10,00\nSUB-TOTAL 10,00';
  }
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin&&url.pathname==='/api/consulta-nfce')return route.fulfill({status:scenario==='svrs'?200:503,
      contentType:'application/json',body:JSON.stringify(scenario==='svrs'?{...official,items:draft.items,source:'SVRS'}:{error:'Consulta indisponível para teste'})});
    if(url.origin===origin)return route.continue();
    if(!url.pathname.startsWith('/rest/v1/rpc/'))return route.abort();
    const name=url.pathname.split('/').at(-1);
    const responses={inventory_login:{ok:true,session_token:'synthetic-session'},
      inventory_tenants:{user,tenants:[{id:'fixture.unit',name:'Unidade sintética'}],activeTenantId:'fixture.unit'},
      inventory_get:{user,revision:0,products:[],documents:[],movements:[]},
      inventory_permissions_list:{self:{'fiscal.pending.read':true,'fiscal.pending.review':true},users:[]},
      pending_receipts_list:[{id:'fixture.note',revision:0,fileName:draft.fileName,draft}],cash_closings_list:[{id:'synthetic.closing',day:'2026-10-10',register:'001',operator:'Operador sintético',dinheiroVendas:100,cashCounted:105,movements:[{type:'suprimento',reason:'Fundo sintético',amount:10},{type:'sangria',reason:'Retirada sintética',amount:5}]}],
      inventory_validate_session:{ok:true,valid:true},pending_receipt_save:{ok:true,revision:1},
      pending_receipt_file:{mime:scenario==='danfe'?'image/png':'application/xml',fileName:scenario==='danfe'?'sintetico.png':'original-sintetico.xml',
        base64:scenario==='danfe'?'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCq0AAAAASUVORK5CYII=':Buffer.from('<?xml version="1.0"?><exemplo>Original sintético, sem validade fiscal</exemplo>').toString('base64')}};
    assert.ok(name in responses,'RPC inesperada: '+name);
    if(name==='pending_receipt_save')assert.ok(!request.postDataJSON().p_draft.supplierCnpj||/^\d{14}$/.test(request.postDataJSON().p_draft.supplierCnpj));
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(responses[name])});
  });
}

/** Confere somente preenchimento e avisos; nunca aciona lançamento. */
async function verifyReading(browser,scenario,official){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  try{
    await mockReading(page,scenario,official);
    await page.goto(origin);
    await page.getByLabel('Login',{exact:true}).fill('synthetic.manager');
    await page.getByLabel('Senha',{exact:true}).fill('Synthetic-only-123');
    await page.getByRole('button',{name:'Entrar no Giro',exact:true}).click();
    await page.getByRole('button',{name:'Notas fiscais',exact:true}).click();
    await page.getByRole('button',{name:'Conferir',exact:true}).click();
    if(scenario==='svrs')await page.getByText('Consulta automática concluída. Itens oficiais adotados para conferência.',{exact:true}).waitFor();
    else if(scenario!=='danfe')await page.getByText('Consulta indisponível para teste',{exact:true}).waitFor();
    assert.equal(await page.getByLabel(/CNPJ do emitente/).inputValue(),scenario==='invalid'?'':'11222333000181');
    assert.match(await page.locator('#supplier-cnpj-status').innerText(),scenario==='invalid'?/Pendente/:/válidos/);
    if(scenario==='svrs'){
      assert.equal(await page.getByLabel('Fornecedor',{exact:true}).inputValue(),'FORNECEDOR SINTETICO LTDA');
      assert.equal(await page.getByLabel(/Subtotal fiscal/).inputValue(),'90');
      assert.equal(await page.getByLabel(/Desconto total/).inputValue(),'10');
      assert.equal(await page.getByLabel('Total líquido calculado automaticamente',{exact:true}).inputValue(),'80.00');
    }
    assert.equal(await page.getByRole('region',{name:'Identificação fiscal da nota',exact:true}).count(),0);
    assert.equal(await page.getByLabel('Chave de acesso NF-e/NFC-e (44 dígitos)',{exact:true}).count(),1);
    if(scenario==='danfe'){
      await page.getByRole('button',{name:'Ler DANFE por regiões',exact:true}).waitFor();
      assert.match(await page.locator('#local-key-status').innerText(),/não comprova consulta à SEFAZ/);
      assert.match(await page.getByRole('region',{name:'Dados do fornecedor e da nota'}).innerText(),/UF: RS.*Série: 001/);
      const input=page.getByLabel('Chave de acesso NF-e/NFC-e (44 dígitos)',{exact:true});
      await input.fill('123');
      await page.getByRole('button',{name:'Confirmar entrada no estoque',exact:true}).click();
      assert.match(await page.locator('.error').innerText(),/Pendente: chave incompleta ou inválida/);
    }
    console.log('PASS CNPJ desktop: '+scenario+'; sem lançamento nem rede externa');
  }finally{await page.close();}
}

/** Usa o texto sintético salvo; verifica recusa e aceite sem chamar Tesseract. */
async function verifySavedOrder(browser,official) {
  const page=await browser.newPage({viewport:{width:1254,height:884}});
  try {
    await mockReading(page,'order',official);await page.goto(origin);
    await page.getByLabel('Login',{exact:true}).fill('synthetic.manager');
    await page.getByLabel('Senha',{exact:true}).fill('Synthetic-only-123');
    await page.getByRole('button',{name:'Entrar no Giro',exact:true}).click();
    await page.getByRole('button',{name:'Notas fiscais',exact:true}).click();
    await page.getByRole('button',{name:'Conferir',exact:true}).click();
    await page.getByText('Texto reconhecido na foto (conferência)',{exact:true}).click();
    const action=page.getByRole('button',{name:'Reinterpretar pedido (sem novo OCR)',exact:true});
    page.once('dialog',dialog=>dialog.dismiss());await action.click();
    assert.equal(await page.getByLabel('Nome do produto da linha 1',{exact:true}).inputValue(),'ITEM SINTETICO');
    page.once('dialog',dialog=>dialog.accept());await action.click();
    await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Nome do produto da linha 1"]').value.includes('500 ML'));
    assert.equal(await page.getByLabel('Nome do produto da linha 1',{exact:true}).inputValue(),'BANDEJA SINTETICA 120 X 160 500 ML C/10 UN.');
    assert.equal(await page.getByLabel('Unidade da linha 1',{exact:true}).inputValue(),'');
    assert.match(await page.getByRole('region',{name:'Dados do fornecedor e da nota'}).innerText(),/Pedido: 000042/);
    console.log('PASS pedido salvo: referência separada, descrição completa, recusa preserva e aceite exige unidade');
  } finally {await page.close();}
}

/** Verifica filtros e detalhes com lançamentos sintéticos, sem salvar caixa. */
async function verifyCashFeedback(browser,official) {
  const page=await browser.newPage({viewport:{width:1254,height:884}});
  try {
    await mockReading(page,'danfe',official);await page.goto(origin);
    await page.getByLabel('Login',{exact:true}).fill('synthetic.manager');
    await page.getByLabel('Senha',{exact:true}).fill('Synthetic-only-123');
    await page.getByRole('button',{name:'Entrar no Giro',exact:true}).click();
    await page.getByRole('button',{name:'Relatórios',exact:true}).click();
    const controls=page.locator('.cash-chart-controls');
    const year=controls.getByLabel('Ano de referência',{exact:true});await year.waitFor();
    assert.equal(await year.locator('option').count(),11);
    await year.selectOption('2026');
    await controls.getByLabel('Mês de referência',{exact:true}).selectOption('10');
    await year.focus();await year.hover();await page.mouse.wheel(0,100);
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Ano de referência"]').value==='2025');
    assert.equal(await year.inputValue(),'2025');await year.selectOption('2026');
    await page.locator('.giro-revenue-bars button').first().click();
    const details=page.locator('.cash-movement-details');
    assert.match(await details.innerText(),/Fundo sintético/);assert.match(await details.innerText(),/Retirada sintética/);
    assert.match(await details.innerText(),/10,00/);assert.match(await details.innerText(),/5,00/);
    assert.match(await page.locator('.cash-day-register-total').innerText(),/100,00/);
    console.log('PASS período: listas, roda e movimentos completos sem alterar vendas ou gravar caixa');
  } finally {await page.close();}
}

(async()=>{
  const {parseSvrsHtml}=await import('../../lib/svrs-parser.mjs');
  const official=parseSvrsHtml(fs.readFileSync('tests/fixtures/nfce/nfce-svrs-sintetica.html','utf8'));
  const browser=await chromium.launch({headless:true,...(process.env.ESTOQUE_CHROME_PATH?{executablePath:process.env.ESTOQUE_CHROME_PATH}:{})});
  try{for(const scenario of ['svrs','ocr','invalid','danfe'])await verifyReading(browser,scenario,official);
    await verifyCashFeedback(browser,official);await verifySavedOrder(browser,official);}finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
