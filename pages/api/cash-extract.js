import { requireInventorySession } from '../../lib/server/inventory-session.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';

export const config={api:{bodyParser:{sizeLimit:'6mb'}}};
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido'});}
 res.setHeader('Cache-Control','no-store');
 if(!await requireInventorySession(req,res))return;
 try{
  const base64=String(req.body?.base64||'');
  if(base64.length>5600000||base64.length<30)return res.status(413).json({error:'O PDF deve ter até 4 MB.'});
  const buffer=Buffer.from(base64,'base64');
  if(buffer.length>4000000||buffer.subarray(0,5).toString()!=='%PDF-')
   return res.status(415).json({error:'Arquivo PDF inválido ou acima de 4 MB.'});
  // pdf-parse 1.x embeds an old PDF.js that rejects some thermal printer PDFs
  // with "Illegal character: 41". Use the modern PDF.js extractor instead.
  const task=pdfjs.getDocument({data:new Uint8Array(buffer),useSystemFonts:true,
    disableFontFace:true,stopAtErrors:false});
  const pdf=await task.promise;
  const pages=[];
  try{
    for(let p=1;p<=Math.min(pdf.numPages,5);p++){
      const page=await pdf.getPage(p);
      const content=await page.getTextContent({disableCombineTextItems:false});
      let output='';
      for(const item of content.items){
        if(typeof item.str!=='string')continue;
        output+=item.str;
        output+=item.hasEOL?'\n':' ';
      }
      pages.push(output);
      page.cleanup();
    }
  }finally{await pdf.destroy();}
  const text=pages.join('\n').slice(0,80000);
  if(text.trim().length<45)return res.status(422).json({
   error:'O PDF parece digitalizado, sem texto selecionável. Envie uma foto JPG/PNG do cupom térmico para leitura OCR.'});
  return res.status(200).json({text});
 }catch(_error){return res.status(422).json({error:'Não foi possível extrair o texto deste PDF. Confira o arquivo ou envie uma foto legível.'});}
}
