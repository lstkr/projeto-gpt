#!/usr/bin/env node
'use strict';

// Runs the application's Tesseract.js parser on private image fixtures.
// It never prints OCR text, fiscal values, hashes, QR data, or personal data.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const sharp=require('sharp');
const {parseCashReport}=require('../lib/cash-report-parser.mjs');
const {needsSecondOcrPass}=require('../lib/receipt-ocr-strategy.mjs');
const {adaptiveBinarizeImageData}=require('../lib/receipt-image-preprocess.mjs');

const root=path.resolve(__dirname,'..');
const manifest=require('../tests/fixtures/private-real-images-20261022.json');
const golden=require('../tests/fixtures/user-thermal-golden-20261021.json');
const fixtureDir=process.argv[2]||process.env.ESTOQUE_REAL_FIXTURES_DIR;
const langPath=process.env.TESSERACT_LANG_PATH;
if(!fixtureDir)throw new Error('Informe o diretório privado das 13 imagens.');
const hasPlainModel=Boolean(langPath&&fs.existsSync(path.join(langPath,'por.traineddata')));
const hasGzipModel=Boolean(langPath&&fs.existsSync(path.join(langPath,'por.traineddata.gz')));
if(langPath&&!hasPlainModel&&!hasGzipModel)
  throw new Error('Modelo Português do Tesseract ausente. Defina TESSERACT_LANG_PATH para uma pasta com por.traineddata ou por.traineddata.gz.');

const page=fs.readFileSync(path.join(root,'pages/index.js'),'utf8');
const productMatching=fs.readFileSync(path.join(root,'lib/duplicate-products.mjs'),'utf8').replace(/^export /gm,'');
const start=page.indexOf('function localizedValue(raw)');
const end=page.indexOf('async function prepareReceiptCanvases',start);
if(start<0||end<=start)throw new Error('Não foi possível carregar os parsers fiscais atuais.');
const parserSource='const norm=(v)=>String(v||"").trim().toLocaleLowerCase("pt-BR");\n'+productMatching+'\n'+page.slice(start,end)+'\n({parseReceiptOcr,parseReceiptTotals,reconcileReceiptTotals,mergeReceiptCandidates})';
const fiscalParser=vm.runInNewContext(parserSource,{URL,console,TextDecoder});
const normalizeMoney=(value)=>Math.round(Number(value)*100)/100;
const parseMoney=(value)=>Number(String(value).replace(/\./g,'').replace(',','.'));
const equalMoney=(actual,expected)=>Number.isFinite(Number(actual))&&normalizeMoney(actual)===normalizeMoney(parseMoney(expected));

async function preparePhoto(bytes,splitReceipts){
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=info;
  const isPaper=(r,g,b)=>Math.min(r,g,b)>175&&Math.max(r,g,b)-Math.min(r,g,b)<60;
  const xScores=new Float32Array(width),yTop=Math.floor(height*.12),yBottom=Math.floor(height*.68);
  for(let x=0;x<width;x++){
    let count=0,samples=0;
    for(let y=yTop;y<yBottom;y+=3){const i=(y*width+x)*channels;if(isPaper(data[i],data[i+1],data[i+2]))count++;samples++;}
    xScores[x]=samples?count/samples:0;
  }
  const smooth=(scores,index,radius)=>{let sum=0,count=0;for(let i=Math.max(0,index-radius);i<=Math.min(scores.length-1,index+radius);i++){sum+=scores[i];count++;}return count?sum/count:0;};
  const radius=Math.max(1,Math.round(width*.002));
  const leftFrom=Math.floor(width*.2),leftTo=Math.floor(width*.43),valleyFrom=Math.floor(width*.43),valleyTo=Math.floor(width*.57),rightFrom=Math.floor(width*.57),rightTo=Math.floor(width*.8);
  const peakLeft=Math.max(...Array.from({length:leftTo-leftFrom},(_,k)=>smooth(xScores,leftFrom+k,radius)));
  const peakRight=Math.max(...Array.from({length:rightTo-rightFrom},(_,k)=>smooth(xScores,rightFrom+k,radius)));
  let valley=1,seam=Math.floor(width/2);
  for(let x=valleyFrom;x<valleyTo;x++){const score=smooth(xScores,x,radius);if(score<valley){valley=score;seam=x;}}
  const twoReceipts=splitReceipts&&width>500&&peakLeft>.48&&peakRight>.48&&valley<Math.min(peakLeft,peakRight)*.8&&valley<.62;
  const segments=twoReceipts?[[0,seam],[seam,width]]:[[0,width]],prepared=[];
  const trimX=(start,end)=>{const peak=Math.max(...Array.from({length:end-start},(_,k)=>xScores[start+k]));const threshold=Math.max(.13,peak*.32);let lo=start,hi=end-1;while(lo<end&&xScores[lo]<threshold)lo++;while(hi>=lo&&xScores[hi]<threshold)hi--;if(hi<=lo)return [start,end];const pad=Math.max(5,Math.round(width*.012));return [Math.max(start,lo-pad),Math.min(end,hi+pad+1)];};
  for(const [segmentStart,segmentEnd] of segments){
    const [sx,ex]=trimX(segmentStart,segmentEnd),sw=Math.max(1,ex-sx),rowScores=new Float32Array(height);
    const scanFrom=Math.floor(height*.04),scanTo=Math.floor(height*.995);
    for(let y=scanFrom;y<scanTo;y++){let count=0,samples=0;for(let x=sx;x<ex;x+=2){const i=(y*width+x)*channels;if(isPaper(data[i],data[i+1],data[i+2]))count++;samples++;}rowScores[y]=samples?count/samples:0;}
    let y0=scanFrom,y1=scanTo-1;while(y0<scanTo&&rowScores[y0]<.2)y0++;while(y1>y0&&rowScores[y1]<.2)y1--;if(y1-y0<height*.2){y0=scanFrom;y1=scanTo-1;}
    const yPad=Math.max(8,Math.round(height*.012));y0=Math.max(0,y0-yPad);y1=Math.min(height,y1+yPad+1);
    const scaledWidth=Math.max(1200,Math.min(1800,Math.round(sw*2.8)));
    const image=await sharp(bytes).extract({left:sx,top:y0,width:sw,height:Math.max(1,y1-y0)})
      .resize({width:scaledWidth}).greyscale().linear(1.7,-122.4).png().toBuffer();
    prepared.push(image);
  }
  return prepared;
}

async function main(){
  const {createWorker}=require('tesseract.js');
  const worker=await createWorker('por',1,langPath?{langPath,cacheMethod:'none',gzip:hasGzipModel}:{});
  await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
  const failures=[],fieldStats={},photoStats=[];let processedDocuments=0;let matchedFields=0;let checkedFields=0;let totalMs=0;
  try{
    for(const photo of manifest.fixtures){
      const photoStart=performance.now();let photoPassed=0,photoChecked=0;
      const bytes=privateImages.get(photo.sha256);
      if(!bytes||bytes.length!==photo.bytes)
        throw new Error(`Fixture privado ausente ou com integridade divergente: ${photo.name}`);
      const canvases=await preparePhoto(bytes,photo.type==='fiscal_document');
      const examples=photo.type==='cash_closing'
        ? golden.cash.filter(row=>row.photo===photo.name)
        : golden.fiscal.filter(row=>row.photo===photo.name);
      if(examples.length!==canvases.length||canvases.length!==photo.documents)throw new Error(`Quantidade de documentos esperada divergente: ${photo.name}`);
      for(let i=0;i<canvases.length;i++){
        const started=performance.now();
        await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});
        const result=await worker.recognize(canvases[i]);
        totalMs+=performance.now()-started;
        const text=result.data.text||'';
        const example=examples.find(row=>row.document_index===(canvases.length===1?0:i))||examples[i];
        processedDocuments++;
        const check=(name,ok)=>{checkedFields++;photoChecked++;fieldStats[name]??={passed:0,checked:0};fieldStats[name].checked++;if(ok){matchedFields++;photoPassed++;fieldStats[name].passed++;}else failures.push(`${photo.name}:${name}`);};
        if(photo.type==='cash_closing'){
          const parsed=parseCashReport(text);
          check('date',parsed.day===example.expected.day.split('/').reverse().join('-'));
          check('register',String(parsed.register||'').replace(/^0+(?=\d)/,'')===String(example.expected.register||'003').replace(/^0+(?=\d)/,''));
          check('total',equalMoney(parsed.reportedTotal,example.expected.total));
          for(const [label,value] of Object.entries(example.expected.channels)){
            const key=({'CARTAO CREDITO':'cartaoCredito','CARTAO DEBITO':'cartaoDebito','CREDITO':'credito','DEBITO':'debito','DINHEIRO':'dinheiroVendas','OUTRAS':'outras'})[label];
            check(`channel_${key}`,equalMoney(parsed[key],value));
          }
          check('movement_count',parsed.movements.length===example.expected.movements.filter(m=>!/^SANGRIA\s*-\s*FECHAMENTO\s+DE\s+CAIXA\b/i.test(m.reason)).length);
        }else{
          const primaryItems=fiscalParser.parseReceiptOcr(text);
          const primaryTotals=fiscalParser.reconcileReceiptTotals(text,'',primaryItems);
          const printedTotal=fiscalParser.parseReceiptTotals(text).total;
          let alternateText='',alternateItems=[];
          if(needsSecondOcrPass(primaryItems,{...primaryTotals,hasPrintedTotal:printedTotal!==null},result.data.confidence)){
            const retryStarted=performance.now();
            const {data:rgba,info}=await sharp(canvases[i]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
            const imageData={width:info.width,height:info.height,data:rgba};
            adaptiveBinarizeImageData(imageData);
            const retry=await sharp(Buffer.from(imageData.data),{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
            await worker.setParameters({tessedit_pageseg_mode:'4',preserve_interword_spaces:'1',user_defined_dpi:'300'});
            const retryResult=await worker.recognize(retry);
            alternateText=retryResult.data.text||'';
            alternateItems=fiscalParser.parseReceiptOcr(alternateText);
            totalMs+=performance.now()-retryStarted;
          }
          const primaryCoded=primaryItems.filter(item=>item.code),alternateCoded=alternateItems.filter(item=>item.code);
          const items=primaryCoded.length||alternateCoded.length
            ?fiscalParser.mergeReceiptCandidates(primaryCoded,alternateCoded)
            :fiscalParser.mergeReceiptCandidates(primaryItems,alternateItems);
          const totals=fiscalParser.reconcileReceiptTotals(text,alternateText,items);
          check('product_count',items.length===example.expected.products);
          check('total',equalMoney(totals.total,example.expected.total));
          if(example.expected.subtotal)check('subtotal',equalMoney(totals.subtotal,example.expected.subtotal));
          if(example.expected.discount)check('discount',equalMoney(totals.discount,example.expected.discount));
          if(example.expected.unit)check('first_unit',items[0]?.unit===example.expected.unit);
          if(example.expected.lastUnit)check('last_unit',items.at(-1)?.unit===example.expected.lastUnit);
        }
      }
      photoStats.push({photo:photo.name,documents:canvases.length,fields_passed:photoPassed,fields_checked:photoChecked,latency_ms:Math.round(performance.now()-photoStart)});
    }
  }finally{await worker.terminate();}
  const score=checkedFields?Math.round(matchedFields/checkedFields*100):0;
  process.stdout.write(JSON.stringify({photos:manifest.photos,documents:processedDocuments,fields_checked:checkedFields,fields_passed:matchedFields,accuracy_percent:score,latency_ms:Math.round(totalMs),photo_results:photoStats,field_results:fieldStats,failures:failures.sort()})+'\n');
  if(failures.length)process.exitCode=1;
}
const privateImages=new Map();
for(const filename of fs.readdirSync(fixtureDir,{withFileTypes:true})){
  if(!filename.isFile())continue;
  const bytes=fs.readFileSync(path.join(fixtureDir,filename.name));
  privateImages.set(crypto.createHash('sha256').update(bytes).digest('hex'),bytes);
}
main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
