const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = import('../lib/fiscal-access-key.mjs');

/** Gera apenas identificadores sintéticos com DV para testar as duas espécies de nota. */
function key(model = '55', cnpj = '11222333000181', month = '10') {
  const base = '4326' + month + cnpj + model + '001000000123112345678';
  let sum = 0;
  for (let index = 42, weight = 2; index >= 0; index--, weight = weight === 9 ? 2 : weight + 1) sum += Number(base[index]) * weight;
  const remainder = sum % 11;
  return base + (remainder < 2 ? 0 : 11 - remainder);
}

test('NF-e 55 e NFC-e 65 fornecem CNPJ do emitente e metadados, mantendo zeros', async () => {
  const {readFiscalAccessKey} = await api;
  for (const model of ['55','65']) assert.deepEqual(readFiscalAccessKey(key(model)), {
    key:key(model),cnpj:'11222333000181',uf:'RS',yearMonth:'10/2026',model,series:'001',invoiceNumber:'000000123'
  });
  assert.equal(readFiscalAccessKey(key().slice(0,43)+(Number(key()[43])+1)%10),null);
  assert.equal(readFiscalAccessKey(key('57')),null);
  assert.equal(readFiscalAccessKey(key('55','11222333000180')),null);
  assert.equal(readFiscalAccessKey(key('55','11222333000181','13')),null);
});

test('chave agrupada ou quebrada em duas linhas é uma só; chaves distintas não se misturam', async () => {
  const {fiscalKeyCandidates,reviewLocalFiscalKey} = await api;
  const grouped=key().match(/.{4}/g).join(' ');
  assert.deepEqual(fiscalKeyCandidates('CHAVE DE ACESSO\n'+grouped.slice(0,24)+'\n'+grouped.slice(24)),[key()]);
  assert.deepEqual(fiscalKeyCandidates(key()+'\n'+key('65')),[key(),key('65')]);
  assert.equal(reviewLocalFiscalKey({ocrText:key()+'\n'+key('65')}).pending,true);
});

test('DANFE ignora CNPJ do destinatário e preenche só o emitente da chave', async () => {
  const {applyLocalFiscalKey,reviewLocalFiscalKey} = await api;
  const draft={ocrText:'EMITENTE SINTETICO CNPJ/CPF\n11.222.333/0001-81\nCHAVE DE ACESSO\n'+key()+'\nDESTINATÁRIO / REMETENTE\nCNPJ/CPF: 45.723.174/0001-10'};
  const result=applyLocalFiscalKey(draft);
  assert.equal(result.supplierCnpj,'11222333000181');
  assert.equal(result.accessKey,key());
  assert.equal(reviewLocalFiscalKey(result).pending,false);
});

test('CNPJ quebrado é confrontado e divergência não é corrigida sem conferência deliberada', async () => {
  const {applyLocalFiscalKey,reviewLocalFiscalKey} = await api;
  const ocrText='CNPJ:\n45.723.174/0001-10\nCHAVE\n'+key();
  const draft=applyLocalFiscalKey({ocrText,supplierCnpj:'45723174000110'});
  assert.equal(draft.supplierCnpj,'45723174000110');
  assert.equal(reviewLocalFiscalKey(draft).pending,true);
  const accepted=applyLocalFiscalKey({...draft,supplierCnpj:'11222333000181',issuerKeyAcknowledged:reviewLocalFiscalKey(draft).issuerEvidence});
  assert.equal(reviewLocalFiscalKey(accepted).pending,false);
  assert.equal(reviewLocalFiscalKey({...accepted,accessKeyInput:key('65')}).pending,true);
  assert.equal(reviewLocalFiscalKey({accessKey:key(),ocrText:'CNPJ: 11.222.333/0001-80'}).pending,true);
});

test('chave digitada incompleta, divergente do QR/OCR e CNPJ inválido no XML continuam pendentes', async () => {
  const {applyLocalFiscalKey,reviewLocalFiscalKey} = await api;
  for(const input of ['1',key().slice(0,43)])assert.equal(reviewLocalFiscalKey({accessKeyInput:input}).pending,true);
  const draft=applyLocalFiscalKey({accessKey:key(),qrRaw:key('65')});
  assert.equal(reviewLocalFiscalKey(draft).pending,true);
  const chosen={...draft,accessKeyInput:key()};
  const conflict=reviewLocalFiscalKey(chosen);
  assert.equal(conflict.canConfirmKey,true);
  assert.equal(reviewLocalFiscalKey({...chosen,keyReadAcknowledged:conflict.evidence}).pending,false);
  assert.equal(reviewLocalFiscalKey({accessKey:key(),issuerCnpjRead:'11222333000180'}).pending,true);
});

test('identificação não altera itens, valores, datas ou revisão e não exige chave em entrada manual', async () => {
  const {applyLocalFiscalKey,reviewLocalFiscalKey} = await api;
  const draft={accessKey:key(),items:[{quantity:20,unitPrice:5.2}],total:104,date:'01/10/2026',revision:7};
  const result=applyLocalFiscalKey(draft);
  for(const field of ['items','total','date','revision'])assert.equal(result[field],draft[field]);
  assert.equal(reviewLocalFiscalKey({supplierCnpj:'11222333000181'}).pending,false);
  assert.equal(reviewLocalFiscalKey({accessKeyInput:key().slice(0,43)+'9'}).pending,true);
});

test('câmera e arquivo usam QR/CODE-128 locais; tela expõe divergência e guarda de lançamento', () => {
  const page=fs.readFileSync('pages/index.js','utf8');
  assert.doesNotMatch(page,/decodeQrViaExternalApi|fetch\(['"]\/api\/qr-externo/);
  assert.match(page,/BarcodeFormat\.CODE_128/);
  assert.match(page,/createFiscalHeaderCrop\(reference\)/);
  assert.match(page,/if \(localKeyReview.pending\)/);
  assert.match(page,/Conferi o emitente na nota e confirmo o CNPJ da chave/);
});

test('leitor real decodifica CODE-128 sintético sem câmera, rede ou imagem fiscal real', async () => {
  const z = require('@zxing/library');
  const symbols = [105, ...key().match(/../g).map(Number)];
  const checksum = symbols.reduce((sum, value, index) => sum + value * (index || 1), 0) % 103;
  const bars = [false,false,false,false,false,false,false,false,false,false];
  for (const symbol of [...symbols,checksum,106])
    z.Code128Reader.CODE_PATTERNS[symbol].forEach((count,index) => bars.push(...Array(count).fill(index % 2 === 0)));
  bars.push(...Array(10).fill(false));
  const width=bars.length*3,height=90,data=new Uint8ClampedArray(width*height*4).fill(255);
  for(let y=10;y<80;y++)for(let x=0;x<width;x++)if(bars[Math.floor(x/3)])data.fill(0,(y*width+x)*4,(y*width+x)*4+3);
  const page=fs.readFileSync('pages/index.js','utf8');
  const start=page.indexOf('async function decodeNfceQrWithZXing('),end=page.indexOf('function createQrFooterCrop(',start);
  const source=page.slice(start,end).replace("await import('@zxing/library')","await Promise.resolve(require('@zxing/library'))");
  const decode=new Function('require','return ('+source.slice(0,source.lastIndexOf('}')+1)+');')(require);
  assert.equal(await decode({width,height,getContext:()=>({getImageData:()=>({data,width,height})})}),key());
});
