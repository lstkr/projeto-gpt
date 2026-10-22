'use strict';
/** Validate owner-authorized private OCR photos WITHOUT uploading, OCR, or network access. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const manifest=require('../tests/fixtures/private-real-images-20261022.json');
const dir=process.argv[2]||process.env.ESTOQUE_REAL_FIXTURES_DIR;
if(!dir){
  console.error('Informe o diretório privado de JPEGs: node scripts/verify-private-image-fixtures.cjs /caminho/para/images');
  console.error('Ou defina ESTOQUE_REAL_FIXTURES_DIR. Nenhuma imagem real fica no repositório.');
  process.exit(2);
}
let errors=0,verified=0;
for(const item of manifest.fixtures){
  if(!/^[a-z0-9-]+\.jpeg$/.test(item.name)||path.basename(item.name)!==item.name){
    console.error('Nome inválido no catálogo.'); errors++; continue;
  }
  const filename=path.join(dir,item.name);
  try {
    const buffer=fs.readFileSync(filename);
    const hash=crypto.createHash('sha256').update(buffer).digest('hex');
    const jpeg=buffer.length>4&&buffer[0]===0xff&&buffer[1]===0xd8&&
      buffer.at(-2)===0xff&&buffer.at(-1)===0xd9;
    if(buffer.length!==item.bytes||hash!==item.sha256||!jpeg){
      console.error('Fixture falhou na integridade: '+item.name);
      errors++;
    } else verified++;
  } catch(e) {
    console.error('Fixture não disponível: '+item.name);
    errors++;
  }
}
if(errors){
  console.error('QA private fixtures: '+verified+'/'+manifest.photos+' verificados; '+errors+' falhas. Originais não foram modificados.');
  process.exit(1);
}
console.log('QA private fixtures: '+verified+' JPEGs íntegros / '+manifest.minimum_documents+
  ' documentos mínimos; pronto para testes de OCR em ambiente isolado.');
