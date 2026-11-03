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
      pending_receipts_list:[{id:'fixture.note',revision:0,fileName:draft.fileName,draft}],cash_closings_list:[],
      inventory_validate_session:{ok:true,valid:true},pending_receipt_save:{ok:true,revision:1},
      pending_receipt_file:{mime:'application/xml',fileName:'original-sintetico.xml',
        base64:Buffer.from('<?xml version="1.0"?><exemplo>Original sintético, sem validade fiscal</exemplo>').toString('base64')}};
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
    if(scenario==='danfe'){
      assert.match(await page.locator('#local-key-status').innerText(),/validados localmente/);
      assert.match(await page.getByRole('region',{name:'Identificação local pela chave'}).innerText(),/UF: RS.*Série: 001/);
      const input=page.getByLabel('Chave de acesso NF-e/NFC-e (44 dígitos)',{exact:true});
      await input.fill('123');
      await page.getByRole('button',{name:'Confirmar entrada no estoque',exact:true}).click();
      assert.match(await page.locator('.error').innerText(),/Pendente: chave incompleta ou inválida/);
    }
    console.log('PASS CNPJ desktop: '+scenario+'; sem lançamento nem rede externa');
  }finally{await page.close();}
}

(async()=>{
  const {parseSvrsHtml}=await import('../../lib/svrs-parser.mjs');
  const official=parseSvrsHtml(fs.readFileSync('tests/fixtures/nfce/nfce-svrs-sintetica.html','utf8'));
  const browser=await chromium.launch({headless:true,...(process.env.ESTOQUE_CHROME_PATH?{executablePath:process.env.ESTOQUE_CHROME_PATH}:{})});
  try{for(const scenario of ['svrs','ocr','invalid','danfe'])await verifyReading(browser,scenario,official);}finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
