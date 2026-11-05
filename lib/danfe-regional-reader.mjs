import {danfeRegions,regionalDanfeText} from './danfe-regions.mjs';

const OCR_REGION_TIMEOUT_MS=120_000;
const MAX_IMAGE_EDGE=3000;
const MAX_IMAGE_PIXELS=6_000_000;
const error=message=>Object.assign(new Error(message),{code:'DANFE_REGIONAL_OCR'});
const aborted=()=>error('Leitura regional cancelada.');

/** Prepara apenas uma cópia local limitada; o original arquivado não é modificado. */
async function localCanvas(url) {
  if(!String(url).startsWith('blob:'))throw error('Abra a imagem original arquivada antes de ler por regiões.');
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(MAX_IMAGE_PIXELS/(image.naturalWidth*image.naturalHeight)));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return canvas;
}

/** Três reconhecimentos sequenciais no mesmo worker: localizar, cabeçalho, produtos. */
async function recognizeRegions(worker,canvas) {
  await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const layout=await worker.recognize(canvas,{}, {text:true,blocks:true});
  const lines=(layout.data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>paragraph.lines||[]));
  const regions=danfeRegions({width:canvas.width,height:canvas.height,lines});
  if(!regions)throw error('Não foi possível delimitar uma única tabela DANFE. Use uma foto mais nítida ou confira manualmente.');
  const header=await worker.recognize(canvas,{rectangle:regions.header},{text:true,blocks:true});
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  const products=await worker.recognize(canvas,{rectangle:regions.products},{text:true,blocks:true});
  return {text:regionalDanfeText(header.data.text,products.data.text),headerText:header.data.text,regions};
}

/** Limita a tarefa e encerra o worker até em cancelamento ou inicialização tardia. */
async function workerTask({createWorker,signal},task) {
  let worker,stopped=false,timer,rejectStop;
  const stop=new Promise((_,reject)=>{rejectStop=reject;});
  const cancel=()=>rejectStop(aborted());
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>rejectStop(error('A leitura regional demorou demais. Confira manualmente.')),OCR_REGION_TIMEOUT_MS);
  async function run() {
    worker=await createWorker('por',1);
    if(stopped||signal?.aborted){await worker.terminate();throw aborted();}
    return task(worker);
  }
  try {if(signal?.aborted)throw aborted();return await Promise.race([run(),stop]);}
  finally {stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(worker)await worker.terminate();}
}

/** Não envia a imagem a OCR externo; resultado só substitui o rascunho após ação humana. */
export async function readDanfeByRegions(url,{signal,createWorker,makeCanvas=localCanvas}={}) {
  const factory=createWorker||(await import('tesseract.js')).createWorker;
  const canvas=await makeCanvas(url);
  return workerTask({createWorker:factory,signal},worker=>recognizeRegions(worker,canvas));
}
