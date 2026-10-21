import { requireInventorySession } from '../../lib/server/inventory-session.mjs';
import { extractCashPdfText } from '../../lib/server/cash-pdf.mjs';

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
  const text=await extractCashPdfText(buffer);
  if(text.trim().length<45)return res.status(422).json({
   error:'O PDF parece digitalizado, sem texto selecionável. Envie uma foto JPG/PNG do cupom térmico para leitura OCR.'});
  return res.status(200).json({text});
 }catch(_error){return res.status(422).json({error:'Não foi possível extrair o texto deste PDF. Confira o arquivo ou envie uma foto legível.'});}
}
