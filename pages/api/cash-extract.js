import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

export const config={api:{bodyParser:{sizeLimit:'6mb'}}};
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido'});}
 const token=String(req.headers['x-estoque-session']||'');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key||!token){return res.status(401).json({error:'Entre no sistema para importar um fechamento.'});}
 try{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:user,error:authError}=await client.rpc('inventory_get',{p_session_token:token});
  if(authError||!user?.user)return res.status(401).json({error:'Sessão inválida.'});
  const base64=String(req.body?.base64||'');
  if(base64.length>5600000||base64.length<30)return res.status(413).json({error:'O PDF deve ter até 4 MB.'});
  const buffer=Buffer.from(base64,'base64');
  if(buffer.length>4000000||buffer.subarray(0,5).toString()!=='%PDF-')
   return res.status(415).json({error:'Arquivo PDF inválido ou acima de 4 MB.'});
  const result=await pdfParse(buffer,{max:5});
  const text=String(result?.text||'').slice(0,80000);
  if(text.trim().length<45)return res.status(422).json({
   error:'O PDF parece digitalizado, sem texto selecionável. Envie uma foto JPG/PNG do cupom térmico para leitura OCR.'});
  return res.status(200).json({text});
 }catch(error){return res.status(422).json({error:'Falha ao ler PDF: '+String(error?.message||'formato não suportado').slice(0,150)});}
}
